/**
 * Regeneration utility with feedback loop
 *
 * Handles retry logic for failed specs with validator feedback.
 */

import type { ValidationResult } from '../validators/tier1-validator.js';

export interface RegenerationContext {
  originalPrompt: string;
  previousAttempt?: string;
  validatorFeedback?: string;
  issues?: ValidationResult['issues'];
  attemptNumber: number;
}

/**
 * Build enhanced prompt for regeneration attempt
 *
 * Includes validator feedback and guidance from previous failures
 */
export function buildRegenerationPrompt(context: RegenerationContext): string {
  if (context.attemptNumber === 1) {
    // First attempt - just the original prompt
    return context.originalPrompt;
  }

  // Subsequent attempts - include feedback
  let prompt = context.originalPrompt;

  prompt += `\n\n---\n\n**PREVIOUS ATTEMPT FAILED**\n\n`;

  if (context.validatorFeedback) {
    prompt += `**Validator Feedback:**\n${context.validatorFeedback}\n\n`;
  }

  if (context.issues && context.issues.length > 0) {
    prompt += `**Specific Issues to Address:**\n\n`;
    for (const issue of context.issues) {
      prompt += `- **${issue.location}** (${issue.severity}): ${issue.problem}\n`;
      prompt += `  → Suggestion: ${issue.suggestion}\n\n`;
    }
  }

  prompt += `**CRITICAL:** This is attempt ${context.attemptNumber}/3. Address ALL issues above.`;

  return prompt;
}

/**
 * Sleep utility for rate limit backoff
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
