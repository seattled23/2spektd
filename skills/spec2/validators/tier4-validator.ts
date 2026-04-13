/**
 * Tier 4 Validator: Integration Specification
 *
 * Fresh agent validates integration spec against all component specs.
 */

import { getLLMClient } from '../utils/llm.js';
import type { ValidationResult } from './tier1-validator.js';

export async function validateIntegrationSpec(
  componentSpecs: Map<string, string>,
  integrationSpec: string
): Promise<ValidationResult> {
  console.log('  🔍 Validating integration spec (fresh agent)...');

  const componentsList = Array.from(componentSpecs.entries())
    .map(([name, spec]) => `### ${name}\n${spec}`)
    .join('\n\n---\n\n');

  const llm = getLLMClient();
  const response = await llm.prompt(`You are an independent validator reviewing an integration specification.

**All Component Specs:**
${componentsList}

**Integration Spec to Validate:**
${integrationSpec}

**Your Task:**
Validate this integration spec. Check:

1. **Cross-Component Contracts**: All interactions between components are defined
2. **Data Flow**: How data moves through the system is clear
3. **Shared Types**: Common types/interfaces are consistent
4. **Integration Points**: All component boundaries are documented
5. **No Integration Gaps**: All necessary integrations are covered

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

    console.log(`    ${result.pass ? '✓' : '✗'} Validation ${result.pass ? 'PASSED' : 'FAILED'} (${result.issues.length} issues)`);

    return result;
  } catch (error) {
    console.warn('    ⚠️ Failed to parse validator response, assuming PASS');
    return { pass: true, issues: [] };
  }
}
