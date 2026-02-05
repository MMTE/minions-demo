export const ANALYZE_CONVERSATION_PROMPT = `Analyze this project discussion to determine its current state.

## Discussion
Title: {{title}}
Body: {{body}}

## Comments
{{comments}}

Determine:
1. Do we have enough information to create a detailed project plan?
2. What key information is missing?
3. Has a plan been proposed and approved?

Respond in JSON:
{
  "phase": "gathering_requirements" | "ready_to_plan" | "plan_proposed" | "approved",
  "missingInfo": ["list of missing information"],
  "hasSufficientContext": boolean,
  "approvalDetected": boolean,
  "summary": "Brief summary of what's been discussed"
}`;

export const CLARIFYING_QUESTIONS_PROMPT = `You are a senior software architect having a conversation about a new project.

## Discussion So Far
{{conversation}}

Generate 3-5 clarifying questions to better understand the requirements.

Focus on:
- Core functionality and user stories
- Technical constraints or preferences
- Scale and performance requirements
- Integration needs
- Timeline and priorities

Be conversational and helpful, not interrogative. Ask questions that will help you create a solid technical plan.`;

export const GENERATE_PROJECT_PLAN_PROMPT = `You are a senior software architect creating a project plan.

## Requirements Discussion
{{conversation}}

Create a comprehensive project plan.

Respond in JSON:
{
  "name": "Project Name",
  "description": "2-3 sentence description",
  "goals": ["Primary goal 1", "Primary goal 2"],
  "techStack": {
    "language": "Primary language",
    "framework": "Main framework",
    "database": "Database choice",
    "other": ["Other technologies"]
  },
  "milestones": [
    {
      "name": "Milestone 1: Foundation",
      "description": "What this milestone achieves",
      "issues": [
        {
          "title": "Clear, actionable issue title",
          "description": "Detailed description with acceptance criteria",
          "labels": ["agent:develop", "priority:high"],
          "estimate": "2 hours"
        }
      ]
    }
  ],
  "repositoryStructure": [
    "src/",
    "tests/",
    "docs/"
  ],
  "risks": ["Potential risk 1", "Potential risk 2"]
}`;
