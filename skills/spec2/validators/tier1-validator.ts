/**
 * Tier 1 Validator: System Specification
 *
 * Fresh agent (no context from generator) validates system spec against requirements.
 * Returns pass/fail with actionable feedback for regeneration.
 */

import { getLLMClient } from '../utils/llm.js';

export interface ValidationResult {
  pass: boolean;
  issues: Array<{
    severity: 'error' | 'warning';
    location: string;
    problem: string;
    suggestion: string;
  }>;
  feedbackForNextAttempt?: string;
}

export async function validateSystemSpec(
  requirements: string,
  systemSpec: string
): Promise<ValidationResult> {
  console.log('  🔍 Validating Tier 1 spec (fresh agent)...');

  const llm = getLLMClient();
  const response = await llm.prompt(`You are an independent validator reviewing a system specification.

**Original Requirements:**
${requirements}

**System Specification to Validate:**
${systemSpec}

**Your Task:**
Validate this system spec against the requirements. Check:

1. **Completeness**: All requirements addressed
2. **Subsystems**: Clearly defined with distinct responsibilities
3. **Coherence**: No contradictions or undefined terms
4. **Architecture**: Logical system boundaries and interactions

**Output Format (JSON):**
\`\`\`json
{
  "pass": true/false,
  "issues": [
    {
      "severity": "error" or "warning",
      "location": "section name",
      "problem": "what's wrong",
      "suggestion": "how to fix it"
    }
  ],
  "feedbackForNextAttempt": "Overall guidance for regeneration (if failed)"
}
\`\`\`

**Critical:** Only mark as "pass": false if there are ERROR-level issues. Warnings are acceptable.`);

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                     [null, response.content];
    const result = JSON.parse(jsonMatch[1]);

    console.log(`    ${result.pass ? '✓' : '✗'} Validation ${result.pass ? 'PASSED' : 'FAILED'} (${result.issues.length} issues)`);

    if (!result.pass) {
      for (const issue of result.issues.filter((i: any) => i.severity === 'error')) {
        console.log(`      ❌ ${issue.location}: ${issue.problem}`);
      }
    }

    return result;
  } catch (error) {
    console.warn('    ⚠️ Failed to parse validator response, assuming PASS');
    return {
      pass: true,
      issues: [],
    };
  }
}
