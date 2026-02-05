const MODEL_COSTS = {
  'anthropic/claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
  'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'openai/gpt-4o': { input: 0.005, output: 0.015 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/gpt-4-turbo': { input: 0.01, output: 0.03 },
  'google/gemini-pro-1.5': { input: 0.0025, output: 0.0075 },
  'deepseek/deepseek-chat': { input: 0.0001, output: 0.0002 },
  'deepseek/deepseek-coder': { input: 0.0001, output: 0.0002 },
  'qwen/qwen-2.5-coder-32b-instruct': { input: 0.0002, output: 0.0006 },
};

export function calculateCost(model, usage) {
  if (!usage) return 0;

  const costs = MODEL_COSTS[model];
  if (!costs) {
    console.warn(`Unknown model for cost calculation: ${model}`);
    return 0;
  }

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;

  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;

  return inputCost + outputCost;
}

export function formatCost(cost) {
  if (cost < 0.01) {
    return `$${(cost * 100).toFixed(3)}c`;
  }
  return `$${cost.toFixed(4)}`;
}

export function estimateCost(model, inputText, estimatedOutputTokens = 500) {
  const estimatedInputTokens = Math.ceil(inputText.length / 4);

  return calculateCost(model, {
    prompt_tokens: estimatedInputTokens,
    completion_tokens: estimatedOutputTokens,
  });
}

export class CostTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalCost = 0;
    this.callCount = 0;
    this.tokenCount = { input: 0, output: 0 };
    this.byModel = {};
  }

  track(model, usage, cost) {
    this.totalCost += cost;
    this.callCount++;
    this.tokenCount.input += usage?.prompt_tokens || 0;
    this.tokenCount.output += usage?.completion_tokens || 0;

    if (!this.byModel[model]) {
      this.byModel[model] = { cost: 0, calls: 0, tokens: 0 };
    }
    this.byModel[model].cost += cost;
    this.byModel[model].calls++;
    this.byModel[model].tokens += (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
  }

  getSummary() {
    return {
      totalCost: this.totalCost,
      formattedCost: formatCost(this.totalCost),
      callCount: this.callCount,
      tokenCount: this.tokenCount,
      totalTokens: this.tokenCount.input + this.tokenCount.output,
      byModel: this.byModel,
    };
  }

  log() {
    const summary = this.getSummary();
    console.log(`\n💰 Cost Summary:`);
    console.log(`   Total: ${summary.formattedCost}`);
    console.log(`   Calls: ${summary.callCount}`);
    console.log(`   Tokens: ${summary.totalTokens.toLocaleString()} (${summary.tokenCount.input.toLocaleString()} in / ${summary.tokenCount.output.toLocaleString()} out)`);

    if (Object.keys(summary.byModel).length > 1) {
      console.log(`   By Model:`);
      for (const [model, stats] of Object.entries(summary.byModel)) {
        console.log(`     - ${model}: ${formatCost(stats.cost)} (${stats.calls} calls)`);
      }
    }
  }
}

export const globalCostTracker = new CostTracker();
