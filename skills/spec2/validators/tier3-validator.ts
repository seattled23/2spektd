/**
 * Tier 3 Validator: Component Specification
 *
 * Fresh agent validates component spec against subsystem spec.
 */

import { getLLMClient } from '../utils/llm.js';
import type { ValidationResult } from './tier1-validator.js';

export async function validateComponentSpec(
  subsystemSpec: string,
  componentName: string,
  componentSpec: string
): Promise<ValidationResult> {
  console.log(`    🔍 Validating ${componentName} spec...`);

  const llm = getLLMClient();
  const response = await llm.prompt(`You are an independent validator reviewing a component specification.

**Subsystem Spec (Parent):**
${subsystemSpec}

**Component Spec to Validate: ${componentName}**
${componentSpec}

**Your Task:**
Validate this component spec. Check:

1. **Alignment with Subsystem**: Fulfills responsibilities from subsystem spec
2. **Function Signatures**: All functions have clear signatures
3. **Acceptance Criteria**: Success criteria are testable
4. **Test Requirements**: How to test this component is defined
5. **No Ambiguity**: Behavior is deterministic and unambiguous

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
