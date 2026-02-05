import OpenAI from 'openai';
import { withRetry } from './retry.js';
import { calculateCost, formatCost, globalCostTracker } from './costs.js';

export const MODELS = {
  coding: 'anthropic/claude-sonnet-4-20250514',
  planning: 'anthropic/claude-sonnet-4-20250514',
  review: 'anthropic/claude-sonnet-4-20250514',
  quick: 'openai/gpt-4o-mini',
  triage: 'openai/gpt-4o-mini',
  budget: 'deepseek/deepseek-chat',
};

class LLMClient {
  constructor() {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/ai-dev-agents',
        'X-Title': 'AI Dev Agents',
      },
    });
  }

  async complete(options) {
    const {
      model = MODELS.coding,
      messages,
      maxTokens = 4096,
      temperature = 0.7,
      jsonMode = false,
    } = options;

    const params = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    if (jsonMode) {
      params.response_format = { type: 'json_object' };
    }

    const response = await withRetry(
      async () => {
        return await this.client.chat.completions.create(params);
      },
      {
        maxAttempts: 3,
        delayMs: 2000,
        onRetry: (attempt, error) => {
          console.log(`LLM retry ${attempt}: ${error.message}`);
        },
        shouldRetry: (error) => {
          if (error.status === 429) return true;
          if (error.status >= 500) return true;
          return false;
        },
      }
    );

    const usage = response.usage;
    const cost = calculateCost(model, usage);
    
    globalCostTracker.track(model, usage, cost);
    
    console.log(`💰 LLM cost: ${formatCost(cost)} (${usage?.total_tokens || 0} tokens)`);

    return {
      content: response.choices[0].message.content,
      usage,
      cost,
      model: response.model,
    };
  }

  async completeJSON(options) {
    const result = await this.complete({ ...options, jsonMode: true });
    try {
      return {
        ...result,
        data: JSON.parse(result.content),
      };
    } catch (error) {
      console.error('Failed to parse JSON response:', result.content?.substring(0, 500));
      
      const jsonMatch = result.content?.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          return {
            ...result,
            data: JSON.parse(jsonMatch[1]),
          };
        } catch {}
      }
      
      throw new Error('LLM returned invalid JSON');
    }
  }

  getCostSummary() {
    return globalCostTracker.getSummary();
  }

  logCostSummary() {
    globalCostTracker.log();
  }

  resetCostTracker() {
    globalCostTracker.reset();
  }
}

export const llm = new LLMClient();

export function buildMessages(systemPrompt, userPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
