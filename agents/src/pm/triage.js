import { createGitHubClient } from '../core/github.js';
import { llm, MODELS, buildMessages } from '../core/llm.js';
import { createLogger } from '../core/logger.js';
import { TRIAGE_ISSUE_PROMPT } from './prompts.js';

async function main() {
  const github = createGitHubClient();
  const logger = createLogger();

  const issueNumber = parseInt(process.env.ISSUE_NUMBER);

  console.log(`PM Agent triaging issue #${issueNumber}`);
  llm.resetCostTracker();

  try {
    await github.checkRateLimit();

    const issue = await github.getIssue(issueNumber);
    
    console.log(`Issue: ${issue.title}`);
    
    const triagePrompt = TRIAGE_ISSUE_PROMPT
      .replace('{{title}}', issue.title)
      .replace('{{body}}', issue.body || 'No description provided.');
    
    const analysis = await llm.completeJSON({
      model: MODELS.triage,
      messages: buildMessages(
        'You are an experienced project manager triaging issues.',
        triagePrompt
      ),
      maxTokens: 1000,
    });
    
    const triage = analysis.data;
    console.log(`Triage: ${triage.type} - ${triage.priority} priority`);
    
    const labelsToAdd = triage.suggestedLabels || [];
    
    if (!labelsToAdd.includes(`priority:${triage.priority}`)) {
      labelsToAdd.push(`priority:${triage.priority}`);
    }
    
    if (triage.agent !== 'none' && !labelsToAdd.includes(`agent:${triage.agent}`)) {
      labelsToAdd.push(`agent:${triage.agent}`);
    }
    
    if (triage.agent !== 'none' && !labelsToAdd.includes('status:ready')) {
      labelsToAdd.push('status:ready');
    }
    
    if (triage.needsHumanInput && !labelsToAdd.includes('human:needed')) {
      labelsToAdd.push('human:needed');
    }
    
    await github.addLabels(issueNumber, labelsToAdd);
    console.log(`Labels added: ${labelsToAdd.join(', ')}`);
    
    let comment = `**PM Agent - Issue Triage**\n\n`;
    comment += `**Type:** ${triage.type}\n`;
    comment += `**Priority:** ${triage.priority}\n`;
    comment += `**Summary:** ${triage.summary}\n\n`;
    
    if (triage.agent !== 'none') {
      const agentNames = {
        architect: 'Architect Agent',
        develop: 'Developer Agent',
        review: 'Reviewer Agent',
        pm: 'PM Agent',
      };
      comment += `**Assigned to:** ${agentNames[triage.agent]}\n\n`;
    }
    
    if (triage.needsHumanInput) {
      comment += `**Human Input Required:** ${triage.reasonForHuman}\n\n`;
      comment += `Please provide the requested information or approval, then the agent can proceed.\n`;
    } else if (triage.agent !== 'none') {
      comment += `This issue has been queued for the ${triage.agent} agent and will be picked up automatically.\n`;
    }
    
    comment += `\n---\n*Triaged by PM Agent*`;
    
    await github.createComment(issueNumber, comment);

    llm.logCostSummary();

    await logger.log({
      agent: 'pm',
      action: 'triage_issue',
      issueNumber,
      modelUsed: MODELS.triage,
      tokensUsed: llm.getCostSummary().totalTokens,
      success: true,
      details: {
        type: triage.type,
        priority: triage.priority,
        assignedAgent: triage.agent,
        needsHuman: triage.needsHumanInput,
      },
    });

    console.log('PM Agent triage completed!');
    
  } catch (error) {
    console.error('PM Agent triage failed:', error);
    
    await github.createComment(
      issueNumber,
      `**PM Agent Error**\n\n\`\`\`\n${error.message}\n\`\`\`\n\nManual triage required.`
    );
    
    await github.addLabels(issueNumber, ['human:needed']);
    
    await logger.log({
      agent: 'pm',
      action: 'triage_error',
      issueNumber,
      success: false,
      error: error.message,
    });
    
    process.exit(1);
  }
}

main();
