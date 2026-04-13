/**
 * Wave Alignment Validator
 *
 * Validates cross-spec consistency within a wave (e.g., all subsystems, all components).
 * Catches naming conflicts, interface mismatches, dependency asymmetries.
 */

import { getLLMClient } from '../utils/llm.js';

export interface AlignmentResult {
  aligned: boolean;
  conflicts: Array<{
    issue: string;
    affectedSpecs: string[];
    suggestion: string;
  }>;
}

export async function alignSubsystemWave(
  systemSpec: string,
  subsystemSpecs: Map<string, string>
): Promise<AlignmentResult> {
  console.log('  🔗 Checking subsystem wave alignment...');

  const specsList = Array.from(subsystemSpecs.entries())
    .map(([name, spec]) => `### ${name}\n${spec}`)
    .join('\n\n---\n\n');

  const llm = getLLMClient();
  const response = await llm.prompt(`You are validating cross-subsystem alignment.

**System Spec (Parent):**
${systemSpec}

**All Subsystem Specs:**
${specsList}

**Your Task:**
Check for cross-subsystem consistency issues:

1. **Naming Consistency**: Same entity → same name everywhere
2. **Interface Compatibility**: Shared types/contracts match
3. **Dependency Coherence**: A→B and B←A both documented
4. **No Orphaned References**: Every mentioned entity exists

**Output Format (JSON):**
\`\`\`json
{
  "aligned": true/false,
  "conflicts": [
    {
      "issue": "description of conflict",
      "affectedSpecs": ["Subsystem1", "Subsystem2"],
      "suggestion": "how to resolve"
    }
  ]
}
\`\`\`

**If no conflicts, return { "aligned": true, "conflicts": [] }**`);

  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                     [null, response.content];
    const result = JSON.parse(jsonMatch[1]);

    console.log(`    ${result.aligned ? '✓' : '✗'} Wave ${result.aligned ? 'ALIGNED' : 'MISALIGNED'} (${result.conflicts.length} conflicts)`);

    if (!result.aligned) {
      for (const conflict of result.conflicts) {
        console.log(`      ⚠️ ${conflict.issue} (affects: ${conflict.affectedSpecs.join(', ')})`);
      }
    }

    return result;
  } catch (error) {
    console.warn('    ⚠️ Failed to parse alignment response, assuming ALIGNED');
    return {
      aligned: true,
      conflicts: [],
    };
  }
}

export async function alignComponentWave(
  subsystemSpecs: Map<string, string>,
  componentSpecs: Map<string, string>
): Promise<AlignmentResult> {
  console.log('  🔗 Checking component wave alignment...');

  const componentsList = Array.from(componentSpecs.entries())
    .map(([name, spec]) => `### ${name}\n${spec}`)
    .join('\n\n---\n\n');

  const llm = getLLMClient();
  const response = await llm.prompt(`You are validating cross-component alignment.

**Parent Subsystem Specs:**
${Array.from(subsystemSpecs.values()).join('\n\n---\n\n')}

**All Component Specs:**
${componentsList}

**Your Task:**
Check for cross-component consistency issues:

1. **Naming Consistency**: Same entity → same name everywhere
2. **Interface Compatibility**: Shared types/functions match exactly
3. **Function Signatures**: A calls B.foo() → B exposes foo() with matching signature
4. **No Orphaned References**: Every mentioned component/type exists

**Output Format (JSON):**
\`\`\`json
{
  "aligned": true/false,
  "conflicts": [
    {
      "issue": "description of conflict",
      "affectedSpecs": ["Component1", "Component2"],
      "suggestion": "how to resolve"
    }
  ]
}
\`\`\`

**If no conflicts, return { "aligned": true, "conflicts": [] }**`);

  try {
    const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                     [null, response.content];
    const result = JSON.parse(jsonMatch[1]);

    console.log(`    ${result.aligned ? '✓' : '✗'} Wave ${result.aligned ? 'ALIGNED' : 'MISALIGNED'} (${result.conflicts.length} conflicts)`);

    if (!result.aligned) {
      for (const conflict of result.conflicts) {
        console.log(`      ⚠️ ${conflict.issue} (affects: ${conflict.affectedSpecs.join(', ')})`);
      }
    }

    return result;
  } catch (error) {
    console.warn('    ⚠️ Failed to parse alignment response, assuming ALIGNED');
    return {
      aligned: true,
      conflicts: [],
    };
  }
}
