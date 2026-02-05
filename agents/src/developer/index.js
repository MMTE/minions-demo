import { createGitHubClient } from '../core/github.js';
import { llm, MODELS, buildMessages } from '../core/llm.js';
import { createMemory } from '../core/memory.js';
import { createLogger } from '../core/logger.js';
import { slugify, truncate } from '../core/utils.js';
import { validateCode } from '../core/validator.js';
import { ANALYZE_ISSUE_PROMPT, IMPLEMENT_FILE_PROMPT, GENERATE_PR_BODY_PROMPT } from './prompts.js';

const MAX_FILES = 10;
const MAX_REVIEW_ITERATIONS = 3;
const MAX_VALIDATION_RETRIES = 2;

async function main() {
  const github = createGitHubClient();
  const memory = createMemory(github);
  const logger = createLogger();

  const issueNumber = parseInt(process.env.ISSUE_NUMBER);

  console.log(`Developer Agent starting for issue #${issueNumber}`);
  llm.resetCostTracker();

  try {
    await github.checkRateLimit();

    const issue = await github.getIssue(issueNumber);
    console.log(`Issue: ${issue.title}`);

    const iterationLabel = issue.labels.find(l => l.name?.startsWith('iteration:'));
    const currentIteration = iterationLabel ? parseInt(iterationLabel.name.split(':')[1]) : 0;

    if (currentIteration >= MAX_REVIEW_ITERATIONS) {
      await github.createComment(
        issueNumber,
        `Maximum review iterations (${MAX_REVIEW_ITERATIONS}) reached. Adding \`human:needed\` for manual review.`
      );
      await github.addLabels(issueNumber, ['human:needed']);
      return;
    }

    await github.addLabels(issueNumber, ['status:in-progress']);
    await github.createComment(issueNumber, '**Developer Agent** picking up this task...\n\nAnalyzing requirements and creating implementation plan.');

    const [repoStructure, memoryContext] = await Promise.all([
      github.getRepositoryTree(),
      memory.getAllContext(),
    ]);

    console.log('Generating implementation plan...');

    const analysisPrompt = ANALYZE_ISSUE_PROMPT
      .replace('{{title}}', issue.title)
      .replace('{{body}}', issue.body || 'No description provided.')
      .replace('{{structure}}', repoStructure.slice(0, 100).join('\n'))
      .replace('{{projectContext}}', truncate(memoryContext.project, 2000))
      .replace('{{conventions}}', truncate(memoryContext.conventions, 1000));

    const analysis = await llm.completeJSON({
      model: MODELS.planning,
      messages: buildMessages(
        'You are a senior developer creating implementation plans. Be practical and focused. Respond ONLY with valid JSON, no markdown.',
        analysisPrompt
      ),
      maxTokens: 2000,
    });

    const plan = analysis.data;
    console.log(`Plan: ${plan.summary}`);

    if (plan.files.length > MAX_FILES) {
      throw new Error(`Too many files (${plan.files.length}). Max is ${MAX_FILES}. Please break into smaller tasks.`);
    }

    let planComment = `**Implementation Plan**\n\n${plan.summary}\n\n`;
    planComment += `**Files to modify:**\n`;
    plan.files.forEach(f => {
      planComment += `- \`${f.path}\` (${f.action}): ${f.description}\n`;
    });
    planComment += `\n**Steps:**\n`;
    plan.steps.forEach((step, i) => {
      planComment += `${i + 1}. ${step}\n`;
    });

    await github.createComment(issueNumber, planComment);

    const branchName = `agent/issue-${issueNumber}-${slugify(issue.title)}`;
    console.log(`Creating branch: ${branchName}`);

    try {
      await github.createBranch(branchName);
    } catch (error) {
      if (!error.message?.includes('Reference already exists')) {
        throw error;
      }
      console.log('Branch already exists, continuing...');
    }

    const implementedFiles = [];

    for (const fileSpec of plan.files) {
      console.log(`Implementing: ${fileSpec.path}`);

      let existingContent = null;
      if (fileSpec.action === 'modify') {
        existingContent = await github.getFileContent(fileSpec.path);
      }

      let code = null;
      let validationPassed = false;

      for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
        const implementPrompt = IMPLEMENT_FILE_PROMPT
          .replace('{{task}}', fileSpec.description)
          .replace('{{path}}', fileSpec.path)
          .replace('{{action}}', fileSpec.action)
          .replace('{{existingContent}}', existingContent || '')
          .replace('{{#if existingContent}}', existingContent ? '' : '<!--')
          .replace('{{else}}', existingContent ? '<!--' : '')
          .replace('{{/if}}', existingContent ? '' : '-->')
          .replace('{{summary}}', plan.summary)
          .replace('{{conventions}}', truncate(memoryContext.conventions, 500));

        const extraPrompt = attempt > 0 && code
          ? `\n\nPrevious attempt had validation errors. Please fix:\n${code.validationErrors?.join('\n')}`
          : '';

        const implementation = await llm.complete({
          model: MODELS.coding,
          messages: buildMessages(
            'You are an expert programmer. Output only code, no explanations or markdown code fences.',
            implementPrompt + extraPrompt
          ),
          maxTokens: 4000,
          temperature: 0.3,
        });

        code = implementation.content.trim();
        if (code.startsWith('```')) {
          code = code.replace(/^```\w*\n/, '').replace(/\n```$/, '');
        }

        const validation = validateCode(code, fileSpec.path);
        if (validation.valid) {
          validationPassed = true;
          break;
        } else {
          console.warn(`Validation failed (attempt ${attempt + 1}):`, validation.errors);
          code = { content: code, validationErrors: validation.errors };
        }
      }

      if (!validationPassed && typeof code === 'object') {
        const errorDetails = code.validationErrors?.join('\n') || 'Unknown validation error';
        throw new Error(`Code validation failed for ${fileSpec.path} after ${MAX_VALIDATION_RETRIES + 1} attempts:\n${errorDetails}`);
      }

      await github.createOrUpdateFile(
        fileSpec.path,
        typeof code === 'string' ? code : code.content,
        `feat: ${fileSpec.description}\n\nCloses #${issueNumber}`,
        branchName
      );

      implementedFiles.push({
        path: fileSpec.path,
        action: fileSpec.action,
        description: fileSpec.description,
      });

      console.log(`Committed: ${fileSpec.path}`);
    }

    if (implementedFiles.length === 0) {
      throw new Error('No files were successfully implemented. All validations failed.');
    }

    console.log('Generating PR body...');

    const prBodyPrompt = GENERATE_PR_BODY_PROMPT
      .replace('{{issueTitle}}', issue.title)
      .replace('{{issueBody}}', issue.body || 'No description')
      .replace('{{summary}}', plan.summary)
      .replace('{{files}}', implementedFiles.map(f => `- ${f.path}: ${f.description}`).join('\n'));

    const prBodyResponse = await llm.complete({
      model: MODELS.quick,
      messages: buildMessages('You write clear PR descriptions.', prBodyPrompt),
      maxTokens: 1000,
    });

    const prTitle = `[Agent] ${issue.title}`;
    const prBody = prBodyResponse.content + `\n\n---\n*Created by Developer Agent*\n\nCloses #${issueNumber}`;

    const pr = await github.createPullRequest(
      prTitle,
      prBody,
      branchName,
      'main'
    );

    console.log(`PR created: #${pr.number}`);

    await github.addLabels(pr.number, ['agent:review']);

    await github.removeLabel(issueNumber, 'status:in-progress');
    await github.addLabels(issueNumber, ['status:review']);

    if (iterationLabel) {
      await github.removeLabel(issueNumber, iterationLabel.name);
    }
    await github.addLabels(issueNumber, [`iteration:${currentIteration + 1}`]);

    await github.createComment(
      issueNumber,
      `**Implementation Complete!**\n\nPR #${pr.number} has been created with the implementation.\n\nThe Reviewer Agent will now review the changes.`
    );

    llm.logCostSummary();

    await logger.log({
      agent: 'developer',
      action: 'implement_issue',
      issueNumber,
      prNumber: pr.number,
      modelUsed: MODELS.coding,
      tokensUsed: llm.getCostSummary().totalTokens,
      success: true,
      details: {
        filesChanged: implementedFiles.length,
        branch: branchName,
        iteration: currentIteration + 1,
      },
    });

    console.log('Developer Agent completed!');

  } catch (error) {
    console.error('Developer Agent failed:', error);

    await github.createComment(
      issueNumber,
      `**Developer Agent Error**\n\n\`\`\`\n${error.message}\n\`\`\`\n\nManual intervention required.`
    );

    await github.addLabels(issueNumber, ['human:needed']);

    await logger.log({
      agent: 'developer',
      action: 'error',
      issueNumber,
      success: false,
      error: error.message,
    });

    process.exit(1);
  }
}

main();
