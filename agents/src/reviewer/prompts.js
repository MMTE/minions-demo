export const REVIEW_FILE_PROMPT = `You are a senior code reviewer analyzing changes in a pull request.

## File: {{filename}}

## Changes (unified diff):
\`\`\`diff
{{patch}}
\`\`\`

## Full File Content:
\`\`\`
{{fullContent}}
\`\`\`

## Original Issue Context:
{{issueContext}}

## Review Checklist:
1. Does the code correctly address the issue requirements?
2. Are there any bugs or logic errors?
3. Is the code readable and maintainable?
4. Are there security concerns (SQL injection, XSS, auth issues)?
5. Is error handling adequate?
6. Are there missing edge cases?
7. Does it follow project conventions?

Respond in JSON:
{
  "issues": ["Critical problems that MUST be fixed"],
  "suggestions": ["Non-critical improvements"],
  "positives": ["Good practices observed"],
  "securityConcerns": ["Any security issues"],
  "score": 1-10
}`;

export const SUMMARIZE_REVIEW_PROMPT = `Summarize this code review into a cohesive PR review comment.

## File Reviews:
{{fileReviews}}

## Overall Stats:
- Files reviewed: {{fileCount}}
- Average score: {{avgScore}}
- Total issues: {{issueCount}}
- Total suggestions: {{suggestionCount}}

Create a well-formatted markdown review that:
1. Starts with an overall assessment
2. Lists critical issues that must be fixed
3. Lists suggestions for improvement
4. Ends with positive observations

Be constructive and helpful. If approving, be encouraging. If requesting changes, be specific about what needs to change.`;
