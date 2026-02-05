export const ANALYZE_ISSUE_PROMPT = `You are a senior software developer analyzing a GitHub issue to create an implementation plan.

## Issue
Title: {{title}}
Body: 
{{body}}

## Repository Structure
{{structure}}

## Project Context
{{projectContext}}

## Coding Conventions
{{conventions}}

## Task
Analyze this issue and create a detailed implementation plan.

Respond in JSON format:
{
  "summary": "Brief 1-2 sentence description of the approach",
  "files": [
    {
      "path": "path/to/file.js",
      "action": "create" | "modify",
      "description": "What changes to make"
    }
  ],
  "steps": ["Step 1", "Step 2", "..."],
  "testStrategy": "How to test these changes",
  "potentialIssues": ["Risk 1", "Risk 2"]
}`;

export const IMPLEMENT_FILE_PROMPT = `You are an expert programmer implementing a feature.

## Task
{{task}}

## File: {{path}}
Action: {{action}}

{{#if existingContent}}
## Existing Content
\`\`\`
{{existingContent}}
\`\`\`
{{else}}
## New File
Create this file from scratch.
{{/if}}

## Overall Context
{{summary}}

## Conventions
{{conventions}}

## Instructions
Generate the complete file content. Follow these rules:
1. Write clean, production-quality code
2. Include appropriate error handling
3. Add helpful comments for complex logic
4. Follow the project's coding conventions
5. Make the code self-documenting

Output ONLY the code, no explanations or markdown code blocks.`;

export const GENERATE_PR_BODY_PROMPT = `Generate a pull request description for these changes.

## Original Issue
Title: {{issueTitle}}
Body: {{issueBody}}

## Implementation Summary
{{summary}}

## Files Changed
{{files}}

Create a clear, well-structured PR description in markdown format including:
1. Summary of changes
2. How it addresses the issue
3. Testing done/needed
4. Any notes for reviewers

Start with "## Summary" - do not include a title.`;
