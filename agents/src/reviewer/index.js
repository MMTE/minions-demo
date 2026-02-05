import { createGitHubClient } from '../core/github.js';
import { llm, MODELS, buildMessages } from '../core/llm.js';
import { createLogger } from '../core/logger.js';
import { extractLinkedIssues, truncate } from '../core/utils.js';
import { REVIEW_FILE_PROMPT, SUMMARIZE_REVIEW_PROMPT } from './prompts.js';

async function main() {
  const github = createGitHubClient();
  const logger = createLogger();

  const prNumber = parseInt(process.env.PR_NUMBER);

  console.log(`Reviewer Agent starting for PR #${prNumber}`);
  llm.resetCostTracker();

  try {
    await github.checkRateLimit();

    const pr = await github.getPullRequest(prNumber);
    const files = await github.getPullRequestFiles(prNumber);
    
    console.log(`PR: ${pr.title}`);
    console.log(`Files changed: ${files.length}`);
    
    const linkedIssues = extractLinkedIssues(pr.body || '');
    let issueContext = 'No linked issues found.';
    
    if (linkedIssues.length > 0) {
      const issue = await github.getIssue(linkedIssues[0]);
      issueContext = `**Issue #${issue.number}: ${issue.title}**\n\n${issue.body || 'No description.'}`;
    }
    
    const fileReviews = [];
    
    for (const file of files) {
      if (file.status === 'removed') continue;
      if (!/\.(js|ts|jsx|tsx|py|go|rs|java|rb|php|vue|svelte)$/.test(file.filename)) {
        console.log(`Skipping non-code file: ${file.filename}`);
        continue;
      }
      
      console.log(`Reviewing: ${file.filename}`);
      
      let fullContent = '';
      try {
        fullContent = await github.getFileContent(file.filename, pr.head.ref);
      } catch {
        fullContent = '[Could not fetch file content]';
      }
      
      const reviewPrompt = REVIEW_FILE_PROMPT
        .replace('{{filename}}', file.filename)
        .replace('{{patch}}', file.patch || '[No patch available]')
        .replace('{{fullContent}}', truncate(fullContent, 6000))
        .replace('{{issueContext}}', truncate(issueContext, 1000));
      
      const review = await llm.completeJSON({
        model: MODELS.review,
        messages: buildMessages(
          'You are a thorough but constructive code reviewer.',
          reviewPrompt
        ),
        maxTokens: 1500,
      });
      
      fileReviews.push({
        filename: file.filename,
        ...review.data,
      });
    }
    
    const allIssues = fileReviews.flatMap(r => r.issues || []);
    const allSuggestions = fileReviews.flatMap(r => r.suggestions || []);
    const allPositives = fileReviews.flatMap(r => r.positives || []);
    const allSecurity = fileReviews.flatMap(r => r.securityConcerns || []);
    const avgScore = fileReviews.length > 0 
      ? fileReviews.reduce((sum, r) => sum + (r.score || 5), 0) / fileReviews.length 
      : 5;
    
    let decision = 'COMMENT';
    let emoji = 'Comment';
    
    if (allSecurity.length > 0 || allIssues.length > 3 || avgScore < 5) {
      decision = 'REQUEST_CHANGES';
      emoji = 'Changes Requested';
    } else if (allIssues.length === 0 && avgScore >= 7) {
      decision = 'APPROVE';
      emoji = 'Approved';
    }
    
    console.log(`Decision: ${decision} (avg score: ${avgScore.toFixed(1)})`);
    
    const summaryPrompt = SUMMARIZE_REVIEW_PROMPT
      .replace('{{fileReviews}}', JSON.stringify(fileReviews, null, 2))
      .replace('{{fileCount}}', fileReviews.length.toString())
      .replace('{{avgScore}}', avgScore.toFixed(1))
      .replace('{{issueCount}}', allIssues.length.toString())
      .replace('{{suggestionCount}}', allSuggestions.length.toString());
    
    const summaryResponse = await llm.complete({
      model: MODELS.quick,
      messages: buildMessages('You write constructive code reviews.', summaryPrompt),
      maxTokens: 1500,
    });
    
    let reviewBody = `## ${emoji} - Code Review by Reviewer Agent\n\n`;
    reviewBody += summaryResponse.content;
    
    if (allSecurity.length > 0) {
      reviewBody += `\n\n### Security Concerns\n`;
      allSecurity.forEach(s => reviewBody += `- ${s}\n`);
    }
    
    reviewBody += `\n\n---\n`;
    reviewBody += `*Reviewed ${fileReviews.length} files | Score: ${avgScore.toFixed(1)}/10*`;
    
    await github.createPullRequestReview(prNumber, reviewBody, decision);
    console.log(`Review submitted: ${decision}`);

    llm.logCostSummary();
    
    await github.removeLabel(prNumber, 'agent:review');
    
    if (decision === 'APPROVE') {
      await github.addLabels(prNumber, ['status:approved']);
    } else if (decision === 'REQUEST_CHANGES') {
      await github.addLabels(prNumber, ['status:changes-requested']);
      await github.addLabels(prNumber, ['agent:develop']);
    }
    
    if (linkedIssues.length > 0) {
      const statusMsg = decision === 'APPROVE' 
        ? 'PR approved and ready to merge!'
        : decision === 'REQUEST_CHANGES'
        ? 'Changes requested on PR. Developer Agent will address feedback.'
        : 'Review comments added to PR.';
      
      await github.createComment(linkedIssues[0], `**PR #${prNumber} Review Update**\n\n${statusMsg}`);
    }
    
    await logger.log({
      agent: 'reviewer',
      action: 'review_pr',
      prNumber,
      issueNumber: linkedIssues[0] || null,
      modelUsed: MODELS.review,
      tokensUsed: llm.getCostSummary().totalTokens,
      success: true,
      details: {
        decision,
        filesReviewed: fileReviews.length,
        issuesFound: allIssues.length,
        avgScore,
      },
    });
    
    console.log('Reviewer Agent completed!');
    
  } catch (error) {
    console.error('Reviewer Agent failed:', error);
    
    await github.createPullRequestReview(
      prNumber,
      `**Reviewer Agent encountered an error**\n\n\`\`\`\n${error.message}\n\`\`\`\n\nManual review required.`,
      'COMMENT'
    );
    
    await github.addLabels(prNumber, ['human:needed']);
    
    await logger.log({
      agent: 'reviewer',
      action: 'error',
      prNumber,
      success: false,
      error: error.message,
    });
    
    process.exit(1);
  }
}

main();
