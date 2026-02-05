export const TRIAGE_ISSUE_PROMPT = `You are a project manager triaging a new GitHub issue.

## Issue
Title: {{title}}
Body: {{body}}

## Available Labels
Agent labels: agent:architect, agent:develop, agent:review, agent:pm
Status labels: status:ready, status:in-progress, status:blocked, status:review
Priority labels: priority:high, priority:medium, priority:low
Human labels: human:needed, human:approved

## Task
Analyze this issue and determine:
1. What type of work is this? (feature, bug, documentation, question, etc.)
2. What priority should it have?
3. Which agent should handle it?
4. Is any human input needed before agents can proceed?

Respond in JSON:
{
  "type": "feature" | "bug" | "documentation" | "question" | "discussion" | "task",
  "priority": "high" | "medium" | "low",
  "agent": "architect" | "develop" | "review" | "pm" | "none",
  "needsHumanInput": boolean,
  "reasonForHuman": "Why human input is needed (or null)",
  "summary": "Brief 1-2 sentence summary of the issue",
  "suggestedLabels": ["list of labels to apply"]
}`;

export const STANDUP_PROMPT = `Generate a daily standup summary for the development team.

## Open Issues
{{openIssues}}

## Recent Pull Requests
{{recentPRs}}

## Recent Commits
{{recentCommits}}

Create a concise standup report covering:
1. What was completed yesterday
2. What's in progress today
3. Any blockers or items needing attention
4. Priorities for today

Keep it focused and actionable. Use bullet points.`;
