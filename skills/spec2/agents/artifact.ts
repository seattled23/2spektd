/**
 * Artifact Generation & Audit Loop
 *
 * Generates 4 validation artifacts for each component:
 * 1. Correspondence Matrix - Maps acceptance criteria to ≥3 validation layers
 * 2. Completeness Manifest - Lists all acceptance criteria with status
 * 3. Test Requirements - Defines what tests are needed (not implementation)
 * 4. Architecture Baseline - Expected coupling, cohesion, complexity scores
 */

import { getLLMClient } from '../utils/llm.js';
import { validateArtifacts } from '../validators/artifact-validator.js';
import { buildRegenerationPrompt } from '../utils/regenerate.js';
import type { ValidationResult } from '../validators/tier1-validator.js';

const MAX_REGENERATION_ATTEMPTS = 3;

interface GeneratedArtifacts {
  correspondence: string;
  completeness: string;
  testRequirements: string;
  architecture: string;
}

export async function generateAndAuditArtifacts(
  componentSpec: string,
  integrationSpec: string,
  component: string
): Promise<GeneratedArtifacts> {
  const llm = getLLMClient();
  let artifacts: GeneratedArtifacts | null = null;
  let validation: ValidationResult = { pass: false, issues: [] };

  for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`  🔄 Regenerating artifacts (attempt ${attempt}/${MAX_REGENERATION_ATTEMPTS})...`);
    }

    // Generate all 4 artifacts in a single prompt
    const prompt = buildArtifactGenerationPrompt(
      componentSpec,
      integrationSpec,
      component,
      attempt,
      artifacts,
      validation
    );

    const response = await llm.prompt(prompt);
    artifacts = parseArtifactsResponse(response.content);

    // Validate the generated artifacts
    validation = await validateArtifacts(componentSpec, component, artifacts);

    if (validation.pass) {
      if (attempt > 1) {
        console.log(`  ✓ Artifacts validated after ${attempt} attempt(s)`);
      }
      return artifacts;
    }

    if (attempt === MAX_REGENERATION_ATTEMPTS) {
      console.error(`  ✗ Artifact validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
      console.error(`  Issues found:`);
      for (const issue of validation.issues) {
        console.error(`    - ${issue.location}: ${issue.problem}`);
      }
      throw new Error(`Artifact validation failed for ${component} after ${MAX_REGENERATION_ATTEMPTS} attempts`);
    }
  }

  // Should never reach here due to throw above
  throw new Error('Unexpected: artifact generation loop exited without result');
}

function buildArtifactGenerationPrompt(
  componentSpec: string,
  integrationSpec: string,
  component: string,
  attemptNumber: number,
  previousArtifacts: GeneratedArtifacts | null,
  validation: ValidationResult
): string {
  let prompt = `You are a validation artifact generator.

**Component Specification:**
${componentSpec}

**Integration Specification:**
${integrationSpec}

**Your Task:**
Generate validation artifacts for component "${component}" to ensure implementation correctness.

**Required Artifacts:**

1. **Correspondence Matrix** (JSON)
   - Map each acceptance criterion from the spec to ≥3 validation layers
   - Format:
   {
     "AC-001: Description": [
       "Layer 1: Contract @pre annotation",
       "Layer 2: Unit test test_name",
       "Layer 3: Hollow pattern check for ..."
     ],
     ...
   }

   RULE: Every acceptance criterion must map to ≥3 layers (L1-L10).

2. **Completeness Manifest** (JSON)
   - List all acceptance criteria with implementation status
   - Format:
   {
     "criteria": [
       {
         "id": "AC-001",
         "description": "Function handles null input",
         "status": "pending"
       },
       ...
     ]
   }

   All statuses must be "pending" (not implemented yet).

3. **Test Requirements** (Markdown)
   - Define what tests are needed (NOT implementation code)
   - Format:
   ## Test Files Needed
   - component_test.ts (or .py, .go depending on language)
   - integration_test.ts

   ## Test Requirements
   - test_function_null: Verify function(null) returns error
   - test_function_valid: Verify function(valid_input) succeeds
   - test_function_edge_case: Verify boundary conditions
   ...

   Coverage target: ≥80%

4. **Architecture Baseline** (JSON)
   - Expected quality metrics
   - Format:
   {
     "expected_coupling": 5,
     "expected_cohesion": 8,
     "max_complexity": 10,
     "min_coverage": 80
   }

**Output Format:**
Return all 4 artifacts in a single response, clearly separated:

\`\`\`correspondence
{JSON for correspondence matrix}
\`\`\`

\`\`\`completeness
{JSON for completeness manifest}
\`\`\`

\`\`\`testRequirements
{Markdown for test requirements}
\`\`\`

\`\`\`architecture
{JSON for architecture baseline}
\`\`\`

**CRITICAL:** All 4 artifacts must be present and properly formatted.`;

  // Add regeneration feedback for attempts after the first
  if (attemptNumber > 1 && previousArtifacts) {
    prompt += `\n\n---\n\n**PREVIOUS ATTEMPT FAILED**\n\n`;

    if (validation.feedbackForNextAttempt) {
      prompt += `**Validator Feedback:**\n${validation.feedbackForNextAttempt}\n\n`;
    }

    if (validation.issues && validation.issues.length > 0) {
      prompt += `**Specific Issues to Address:**\n\n`;
      for (const issue of validation.issues) {
        prompt += `- **${issue.location}** (${issue.severity}): ${issue.problem}\n`;
        prompt += `  → Suggestion: ${issue.suggestion}\n\n`;
      }
    }

    prompt += `**CRITICAL:** This is attempt ${attemptNumber}/${MAX_REGENERATION_ATTEMPTS}. Address ALL issues above.`;
  }

  return prompt;
}

function parseArtifactsResponse(content: string): GeneratedArtifacts {
  // Extract each artifact using code block markers
  const correspondenceMatch = content.match(/```correspondence\s*([\s\S]*?)```/);
  const completenessMatch = content.match(/```completeness\s*([\s\S]*?)```/);
  const testRequirementsMatch = content.match(/```testRequirements\s*([\s\S]*?)```/);
  const architectureMatch = content.match(/```architecture\s*([\s\S]*?)```/);

  if (!correspondenceMatch || !completenessMatch || !testRequirementsMatch || !architectureMatch) {
    throw new Error('Failed to parse artifacts response: missing one or more artifact sections');
  }

  return {
    correspondence: correspondenceMatch[1].trim(),
    completeness: completenessMatch[1].trim(),
    testRequirements: testRequirementsMatch[1].trim(),
    architecture: architectureMatch[1].trim()
  };
}
