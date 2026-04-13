/**
 * LLM Provider Configuration
 *
 * Production-grade config with optional testing mode for free tier limits.
 *
 * TESTING MODE (for free tier testing):
 *   export SPEC2_TESTING_MODE=true
 *
 * PRODUCTION MODE (default):
 *   No artificial token limits, providers handle their own rate limits
 */

export interface ProviderConfig {
  enabled: boolean;
  model: string;
  retry: {
    maxAttempts: number;
    backoffMultiplier: number; // Exponential backoff: 2^attempt * multiplier
  };
  testingLimits?: {
    // Only applied when SPEC2_TESTING_MODE=true
    tokensPerMinute: number;
    requestsPerMinute: number;
  };
}

export interface LLMConfig {
  testingMode: boolean;
  groq: ProviderConfig;
  openrouter: ProviderConfig;
  anthropic: ProviderConfig;
}

/**
 * Get LLM configuration
 *
 * Providers are enabled if their API key is set.
 * Override defaults with environment variables:
 * - SPEC2_TESTING_MODE=true (enables free tier token limits)
 * - DISABLE_GROQ=true
 * - DISABLE_OPENROUTER=true
 * - DISABLE_ANTHROPIC=true
 */
export function getLLMConfig(): LLMConfig {
  const testingMode = process.env.SPEC2_TESTING_MODE === 'true';

  return {
    testingMode,

    // Groq: Fast, production or free tier
    groq: {
      enabled: !!process.env.GROQ_API_KEY && process.env.DISABLE_GROQ !== 'true',
      model: 'llama-3.1-8b-instant',
      retry: {
        maxAttempts: 3,
        backoffMultiplier: 1000,
      },
      testingLimits: {
        tokensPerMinute: 6000, // Free tier: 6K TPM
        requestsPerMinute: 30,
      },
    },

    // OpenRouter: Free or paid tier
    openrouter: {
      enabled: !!process.env.OPENROUTER_API_KEY && process.env.DISABLE_OPENROUTER !== 'true',
      model: 'openrouter/free',
      retry: {
        maxAttempts: 3,
        backoffMultiplier: 1000,
      },
      testingLimits: {
        tokensPerMinute: Infinity, // No TPM limit
        requestsPerMinute: 20, // Free tier: 20 RPM
      },
    },

    // Anthropic: Production tier
    anthropic: {
      enabled: !!process.env.ANTHROPIC_API_KEY && process.env.DISABLE_ANTHROPIC !== 'true',
      model: 'claude-sonnet-4-5-20250929',
      retry: {
        maxAttempts: 3,
        backoffMultiplier: 1000,
      },
      // No testing limits - production only
    },
  };
}

/**
 * Get max_tokens for a request
 *
 * PRODUCTION MODE: No artificial limits (16K default, respects provider's own limits)
 * TESTING MODE: Conservative limits to stay within free tier (3.6K for Groq)
 */
export function getMaxTokens(config: LLMConfig, provider: ProviderConfig, requested?: number): number {
  // If user explicitly requests a limit, honor it
  if (requested !== undefined) {
    return requested;
  }

  // Production mode: generous defaults
  if (!config.testingMode) {
    return 16000; // Let provider handle its own limits
  }

  // Testing mode: stay within free tier
  if (provider.testingLimits) {
    const { tokensPerMinute } = provider.testingLimits;
    if (tokensPerMinute === Infinity) {
      return 8000; // Reasonable default
    }
    // Reserve 40% for prompt tokens
    return Math.floor(tokensPerMinute * 0.6);
  }

  return 8000; // Fallback
}
