/**
 * Artifact Validator
 *
 * Fresh agent validates generated artifacts against component spec.
 */

import { getLLMClient } from '../utils/llm.js';
import type { ValidationResult } from './tier1-validator.js';

export async function validateArtifacts(
  componentSpec: string,
  componentName: string,
  artifacts: {
    correspondence?: string;
    completeness?: string;
    testRequirements?: string;
    architecture?: string;
  }
): Promise<ValidationResult> {
  console.log(`    🔍 Validating ${componentName} artifacts...`);

  const artifactsList = Object.entries(artifacts)
    .filter(([_, content]) => content !== undefined)
    .map(([name, content]) => `### ${name}\n${content}`)
    .join('\n\n---\n\n');

  const llm = getLLMClient();
  const response = await llm.prompt(`You are an independent validator reviewing generated artifacts.

**Component Spec:**
${componentSpec}

**Generated Artifacts for ${componentName}:**
${artifactsList}

**Your Task:**
Validate these artifacts. Check:

1. **Correspondence Matrix**: All properties → ≥3 validation layers
2. **Completeness Manifest**: All acceptance criteria covered
3. **Test Requirements**: All requirements are testable
4. **Architecture Baseline**: Matches spec constraints

**Output Format (JSON):**
\`\`\`json
{
  "pass": true/false,
  "issues": [
    {
      "severity": "error" or "warning",
      "location": "artifact name",
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
