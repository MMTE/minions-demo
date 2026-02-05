export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    onRetry = () => {},
    shouldRetry = () => true,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.status === 401 || error.status === 403) {
        throw error;
      }

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        onRetry(attempt, error);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  return withRetry(fn, {
    maxAttempts: maxRetries,
    delayMs: baseDelay,
    backoffMultiplier: 2,
  });
}
