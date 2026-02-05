export class ActivityLogger {
  constructor(dashboardUrl, apiKey) {
    this.dashboardUrl = dashboardUrl;
    this.apiKey = apiKey;
  }

  async log(activity) {
    const payload = {
      timestamp: new Date().toISOString(),
      agent: activity.agent,
      action: activity.action,
      issueNumber: activity.issueNumber || null,
      prNumber: activity.prNumber || null,
      modelUsed: activity.model || null,
      tokensUsed: activity.tokens || null,
      success: activity.success !== false,
      details: activity.details || null,
      error: activity.error || null,
    };

    if (this.dashboardUrl) {
      try {
        await fetch(`${this.dashboardUrl}/api/activity`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.error('Failed to log to dashboard:', error);
      }
    }

    console.log(`[${payload.agent}] ${payload.action}:`, JSON.stringify(payload, null, 2));
  }
}

export function createLogger() {
  return new ActivityLogger(
    process.env.DASHBOARD_URL,
    process.env.DASHBOARD_API_KEY
  );
}
