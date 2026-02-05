import { createGitHubClient } from '../core/github.js';
import { llm, MODELS, buildMessages } from '../core/llm.js';
import { createMemory } from '../core/memory.js';
import { createLogger } from '../core/logger.js';
import { 
  ANALYZE_CONVERSATION_PROMPT, 
  CLARIFYING_QUESTIONS_PROMPT, 
  GENERATE_PROJECT_PLAN_PROMPT 
} from './prompts.js';

async function main() {
  const github = createGitHubClient();
  const memory = createMemory(github);
  const logger = createLogger();

  const discussionNumber = parseInt(process.env.DISCUSSION_NUMBER);

  console.log(`Architect Agent starting for discussion #${discussionNumber}`);
  llm.resetCostTracker();

  try {
    await github.checkRateLimit();

    const discussion = await github.getDiscussion(discussionNumber);
    
    console.log(`Discussion: ${discussion.title}`);
    
    const conversation = [
      { author: discussion.author.login, content: discussion.body },
      ...discussion.comments.nodes.map(c => ({
        author: c.author.login,
        content: c.body,
        date: c.createdAt,
      })),
    ];
    
    const conversationText = conversation
      .map(c => `**${c.author}:** ${c.content}`)
      .join('\n\n---\n\n');
    
    const analysisPrompt = ANALYZE_CONVERSATION_PROMPT
      .replace('{{title}}', discussion.title)
      .replace('{{body}}', discussion.body)
      .replace('{{comments}}', conversationText);
    
    const analysis = await llm.completeJSON({
      model: MODELS.planning,
      messages: buildMessages('You analyze project discussions.', analysisPrompt),
    });
    
    const state = analysis.data;
    console.log(`Phase: ${state.phase}`);
    
    if (state.phase === 'gathering_requirements' || !state.hasSufficientContext) {
      console.log('Generating clarifying questions...');
      
      const questionsPrompt = CLARIFYING_QUESTIONS_PROMPT
        .replace('{{conversation}}', conversationText);
      
      const questionsResponse = await llm.complete({
        model: MODELS.planning,
        messages: buildMessages(
          'You are a helpful software architect.',
          questionsPrompt
        ),
      });
      
      const comment = `**Architect Agent**\n\nThanks for sharing this idea! To help me create a solid plan, I have a few questions:\n\n${questionsResponse.content}\n\n---\n*Once you've answered these, I'll generate a detailed project plan.*`;

      await github.createDiscussionComment(discussion.id, comment);

      llm.logCostSummary();

      await logger.log({
        agent: 'architect',
        action: 'ask_questions',
        modelUsed: MODELS.planning,
        tokensUsed: llm.getCostSummary().totalTokens,
        details: { discussionNumber, phase: state.phase },
        success: true,
      });
      
    } else if (state.phase === 'ready_to_plan' || state.hasSufficientContext) {
      console.log('Generating project plan...');
      
      const planPrompt = GENERATE_PROJECT_PLAN_PROMPT
        .replace('{{conversation}}', conversationText);
      
      const planResponse = await llm.completeJSON({
        model: MODELS.planning,
        messages: buildMessages(
          'You are an expert software architect creating project plans.',
          planPrompt
        ),
        maxTokens: 4000,
      });
      
      const plan = planResponse.data;
      
      let planComment = `**Architect Agent - Project Plan**\n\n`;
      planComment += `## ${plan.name}\n\n`;
      planComment += `${plan.description}\n\n`;
      
      planComment += `### Goals\n`;
      plan.goals.forEach(g => planComment += `- ${g}\n`);
      
      planComment += `\n### Tech Stack\n`;
      planComment += `- **Language:** ${plan.techStack.language}\n`;
      planComment += `- **Framework:** ${plan.techStack.framework}\n`;
      planComment += `- **Database:** ${plan.techStack.database}\n`;
      if (plan.techStack.other?.length) {
        planComment += `- **Other:** ${plan.techStack.other.join(', ')}\n`;
      }
      
      planComment += `\n### Milestones\n`;
      plan.milestones.forEach((m, i) => {
        planComment += `\n#### ${i + 1}. ${m.name}\n`;
        planComment += `${m.description}\n\n`;
        planComment += `**Issues:**\n`;
        m.issues.forEach(issue => {
          planComment += `- [ ] ${issue.title} *(${issue.estimate})*\n`;
        });
      });
      
      planComment += `\n### Repository Structure\n\`\`\`\n`;
      plan.repositoryStructure.forEach(p => planComment += `${p}\n`);
      planComment += `\`\`\`\n`;
      
      if (plan.risks?.length) {
        planComment += `\n### Risks\n`;
        plan.risks.forEach(r => planComment += `- ${r}\n`);
      }
      
      planComment += `\n---\n`;
      planComment += `**To approve this plan and create issues, reply with:** \`@agent-architect approve\`\n\n`;
      planComment += `*Or provide feedback for adjustments.*`;
      
      await github.createDiscussionComment(discussion.id, planComment);
      
      await memory.updateProjectContext(
        `# ${plan.name}\n\n${plan.description}\n\n## Goals\n${plan.goals.map(g => `- ${g}`).join('\n')}`,
        `Project plan created: ${plan.name}`
      );
      
      await logger.log({
        agent: 'architect',
        action: 'generate_plan',
        details: { 
          discussionNumber, 
          projectName: plan.name,
          milestones: plan.milestones.length,
          totalIssues: plan.milestones.reduce((sum, m) => sum + m.issues.length, 0),
        },
        success: true,
      });
      
    } else if (state.approvalDetected || state.phase === 'approved') {
      console.log('Approval detected, creating issues...');
      
      const planPrompt = GENERATE_PROJECT_PLAN_PROMPT
        .replace('{{conversation}}', conversationText);
      
      const planResponse = await llm.completeJSON({
        model: MODELS.planning,
        messages: buildMessages(
          'You are an expert software architect.',
          planPrompt
        ),
        maxTokens: 4000,
      });
      
      const plan = planResponse.data;
      const createdIssues = [];
      
      for (const milestone of plan.milestones) {
        console.log(`Creating milestone: ${milestone.name}`);
        
        const ghMilestone = await github.createMilestone(
          milestone.name,
          milestone.description
        );
        
        for (const issueSpec of milestone.issues) {
          const issueBody = `## Description\n${issueSpec.description}\n\n` +
            `## Acceptance Criteria\n- [ ] Implementation complete\n- [ ] Tests passing\n- [ ] Documentation updated\n\n` +
            `## Estimate\n${issueSpec.estimate}\n\n` +
            `---\n*Created by Architect Agent from discussion #${discussionNumber}*`;
          
          const issue = await github.createIssue(
            issueSpec.title,
            issueBody,
            issueSpec.labels,
            ghMilestone.number
          );
          
          createdIssues.push({
            number: issue.number,
            title: issue.title,
            milestone: milestone.name,
          });
          
          console.log(`Created issue #${issue.number}: ${issue.title}`);
        }
      }
      
      let summaryComment = `**Project Created!**\n\n`;
      summaryComment += `I've created ${createdIssues.length} issues across ${plan.milestones.length} milestones:\n\n`;
      
      for (const milestone of plan.milestones) {
        summaryComment += `### ${milestone.name}\n`;
        createdIssues
          .filter(i => i.milestone === milestone.name)
          .forEach(i => summaryComment += `- #${i.number} - ${i.title}\n`);
        summaryComment += `\n`;
      }
      
      summaryComment += `\n---\n*The Developer Agent will now pick up issues with the \`agent:develop\` label.*`;

      await github.createDiscussionComment(discussion.id, summaryComment);

      llm.logCostSummary();

      await logger.log({
        agent: 'architect',
        action: 'create_issues',
        modelUsed: MODELS.planning,
        tokensUsed: llm.getCostSummary().totalTokens,
        details: {
          discussionNumber,
          issuesCreated: createdIssues.length,
          milestones: plan.milestones.length,
        },
        success: true,
      });
    }

    console.log('Architect Agent completed!');
    
  } catch (error) {
    console.error('Architect Agent failed:', error);
    
    await logger.log({
      agent: 'architect',
      action: 'error',
      success: false,
      error: error.message,
    });
    
    process.exit(1);
  }
}

main();
