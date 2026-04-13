/**
 * Wave regeneration helpers
 *
 * Reusable logic for regenerating failed specs with validator feedback
 */

import { getLLMClient } from './llm.js';
import type { ValidationResult } from '../validators/tier1-validator.js';

export interface RegenerationOptions {
  maxAttempts: number;
  generateFn: (prompt: string) => Promise<string>;
  validateFn: (spec: string) => Promise<ValidationResult>;
  buildPromptFn: (attemptNumber: number, previousSpec?: string, validation?: ValidationResult) => string;
  entityName: string; // For logging
}

/**
 * Generic regeneration loop for any spec/artifact
 *
 * Tries up to maxAttempts, accumulating validator feedback between attempts
 */
export async function regenerateUntilValid(
  options: RegenerationOptions
): Promise<{ spec: string; validation: ValidationResult; attempts: number }> {
  const { maxAttempts, generateFn, validateFn, buildPromptFn, entityName } = options;

  let spec = '';
  let validation: ValidationResult = { pass: false, issues: [] };
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;

    if (attempt > 1) {
      console.log(`      Regenerating ${entityName} (attempt ${attempt}/${maxAttempts})...`);
    }

    const prompt = buildPromptFn(attempt, spec, validation);
    spec = await generateFn(prompt);
    validation = await validateFn(spec);

    if (validation.pass) {
      if (attempt > 1) {
        console.log(`      ✓ ${entityName} passed validation after ${attempt} attempt(s)`);
      }
      break;
    }

    if (attempt === maxAttempts) {
      console.error(`      ✗ ${entityName} failed validation after ${maxAttempts} attempts`);
      throw new Error(`${entityName} validation failed after ${maxAttempts} attempts`);
    }
  }

  return { spec, validation, attempts };
}

/**
 * Regenerate multiple specs in parallel (for waves with multiple items)
 */
export async function regenerateMultipleUntilValid<T extends { name: string }>(
  items: T[],
  options: Omit<RegenerationOptions, 'entityName'> & {
    getEntityName: (item: T) => string;
  }
): Promise<Array<{ item: T; spec: string; validation: ValidationResult; attempts: number }>> {
  return Promise.all(
    items.map(async (item) => {
      const result = await regenerateUntilValid({
        ...options,
        entityName: options.getEntityName(item),
      });

      return {
        item,
        ...result,
      };
    })
  );
}
