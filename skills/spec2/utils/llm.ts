/**
 * LLM client abstraction - supports multiple providers with automatic failover
 *
 * Providers (in priority order):
 * 1. Groq (GROQ_API_KEY) - free tier, blazing fast
 * 2. OpenRouter (OPENROUTER_API_KEY) - free tier, auto-routing
 * 3. Anthropic (ANTHROPIC_API_KEY) - paid tier, fallback
 *
 * Enable/disable providers with environment variables:
 * - DISABLE_GROQ=true
 * - DISABLE_OPENROUTER=true
 * - DISABLE_ANTHROPIC=true
 */

import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { getLLMConfig, getMaxTokens, type ProviderConfig } from './llm-config.js';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  provider: 'groq' | 'openrouter' | 'anthropic';
  model: string;
  tokensUsed?: number;
}

export class LLMClient {
  private groqClient?: Groq;
  private openrouterClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private config = getLLMConfig();

  constructor() {
    // Initialize enabled providers
    if (this.config.groq.enabled) {
      this.groqClient = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
    }

    if (this.config.openrouter.enabled) {
      this.openrouterClient = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      });
    }

    if (this.config.anthropic.enabled) {
      this.anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    if (!this.groqClient && !this.openrouterClient && !this.anthropicClient) {
      throw new Error(
        'No LLM API keys configured. Set GROQ_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY'
      );
    }
  }

  /**
   * Send a prompt to the LLM with automatic provider failover
   *
   * Tries providers in order: Groq → OpenRouter → Anthropic
   * Handles rate limits with exponential backoff retry
   */
  async chat(
    messages: LLMMessage[],
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<LLMResponse> {
    const temperature = options?.temperature || 1.0;

    // Try Groq first (fastest, free tier: 6K TPM)
    if (this.groqClient && this.config.groq.enabled) {
      const result = await this.tryProvider(
        'groq',
        this.config.groq,
        async (maxTokens) => {
          const response = await this.groqClient!.chat.completions.create({
            model: this.config.groq.model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: maxTokens,
            temperature,
          });

          return {
            content: response.choices[0]?.message?.content || '',
            provider: 'groq' as const,
            model: this.config.groq.model,
            tokensUsed: response.usage?.total_tokens,
          };
        },
        options?.maxTokens
      );

      if (result) return result;
    }

    // Try OpenRouter (free router, 20 RPM)
    if (this.openrouterClient && this.config.openrouter.enabled) {
      const result = await this.tryProvider(
        'openrouter',
        this.config.openrouter,
        async (maxTokens) => {
          const response = await this.openrouterClient!.chat.completions.create({
            model: this.config.openrouter.model, // 'openrouter/free' auto-router
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            max_tokens: maxTokens,
            temperature,
          });

          return {
            content: response.choices[0]?.message?.content || '',
            provider: 'openrouter' as const,
            model: this.config.openrouter.model,
            tokensUsed: response.usage?.total_tokens,
          };
        },
        options?.maxTokens
      );

      if (result) return result;
    }

    // Fallback to Anthropic (paid tier)
    if (this.anthropicClient && this.config.anthropic.enabled) {
      const result = await this.tryProvider(
        'anthropic',
        this.config.anthropic,
        async (maxTokens) => {
          const response = await this.anthropicClient!.messages.create({
            model: this.config.anthropic.model,
            max_tokens: maxTokens,
            temperature,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
          });

          const content = response.content[0];
          return {
            content: content.type === 'text' ? content.text : '',
            provider: 'anthropic' as const,
            model: this.config.anthropic.model,
            tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          };
        },
        options?.maxTokens
      );

      if (result) return result;
    }

    throw new Error('All LLM providers failed');
  }

  /**
   * Try a provider with retry logic for rate limits
   */
  private async tryProvider(
    name: string,
    providerConfig: ProviderConfig,
    callFn: (maxTokens: number) => Promise<LLMResponse>,
    requestedMaxTokens?: number
  ): Promise<LLMResponse | null> {
    const maxTokens = getMaxTokens(this.config, providerConfig, requestedMaxTokens);
    const { maxAttempts, backoffMultiplier } = providerConfig.retry;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await callFn(maxTokens);
      } catch (error: any) {
        // Check if it's a rate limit error
        const isRateLimit =
          error.status === 429 ||
          error.status === 413 ||
          (error.message && error.message.includes('rate_limit')) ||
          (error.message && error.message.includes('Rate limit'));

        if (isRateLimit && attempt < maxAttempts - 1) {
          // Extract wait time from error or use exponential backoff
          const waitMatch = error.message?.match(/try again in ([\d.]+)s/);
          const waitTime = waitMatch
            ? Math.ceil(parseFloat(waitMatch[1]) * 1000)
            : Math.pow(2, attempt) * backoffMultiplier;

          console.warn(`⚠️  ${name} rate limit hit, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Not a rate limit or max retries reached
        console.warn(
          `⚠️  ${name} failed (${error.status || 'error'}: ${error.message || error}), trying next provider`
        );
        return null; // Try next provider
      }
    }

    return null;
  }

  /**
   * Convenience method for single-prompt calls
   */
  async prompt(
    userPrompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
    }
  ): Promise<LLMResponse> {
    return this.chat([{ role: 'user', content: userPrompt }], options);
  }
}

// Singleton instance
let client: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!client) {
    client = new LLMClient();
  }
  return client;
}
