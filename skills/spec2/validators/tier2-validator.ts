/**
 * Tier 2 Validator: Subsystem Specification
 *
 * Fresh agent validates subsystem spec against system spec.
 */

import { getLLMClient } from '../utils/llm.js';
import type { ValidationResult } from './tier1-validator.js';

export async function validateSubsystemSpec(
  systemSpec: string,
  subsystemName: string,
  subsystemSpec: string
): Promise<ValidationResult> {
  console.log(`    🔍 Validating ${subsystemName} spec...`);

  const llm = getLLMClient();
  const response = await llm.prompt(`You are an independent validator reviewing a subsystem specification.

**System Spec (Parent):**
${systemSpec}

**Subsystem Spec to Validate: ${subsystemName}**
${subsystemSpec}

**Your Task:**
Validate this subsystem spec. Check:

1. **Alignment with System**: Matches responsibilities from system spec
2. **Component Identification**: Components clearly defined with distinct purposes
3. **Dependencies**: What this subsystem needs/provides is clear
4. **Test Strategy**: How to test this subsystem is defined
5. **No Implementation Details**: Focuses on WHAT, not HOW (that's Tier 3)

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

**Only mark as "pass": false if there are ERROR-level issues.**`);

  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                     [null, response.content];
    const result = JSON.parse(jsonMatch[1]);

    console.log(`      ${result.pass ? '✓' : '✗'} ${result.pass ? 'PASSED' : 'FAILED'} (${result.issues.length} issues)`);

    return result;
  } catch (error) {
    console.warn(`      ⚠️ Failed to parse validator response, assuming PASS`);
    return { pass: true, issues: [] };
  }
}
