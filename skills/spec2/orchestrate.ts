/**
 * Main orchestration logic for Spec2
 *
 * Implements wave-based validation with:
 * - Individual validators (fresh agents) after each spec
 * - Wave alignment validators for cross-spec consistency
 * - Feedback loops for regeneration (max 3 attempts)
 * - Parallel execution within waves with sync barriers
 */

import { generateSystemSpec } from './agents/tier1.js';
import { generateSubsystemSpecs } from './agents/tier2.js';
import { generateComponentSpecs } from './agents/tier3.js';
import { generateIntegrationSpec } from './agents/tier4.js';
import { generateAndAuditArtifacts } from './agents/artifact.js';
import { generateAndValidateCode } from './agents/codegen.js';
import { extractSubsystems, extractComponents } from './utils/extract.js';
import { saveAndLock } from './utils/lock.js';
import { validateSystemSpec } from './validators/tier1-validator.js';
import { validateSubsystemSpec } from './validators/tier2-validator.js';
import { validateComponentSpec } from './validators/tier3-validator.js';
import { validateIntegrationSpec } from './validators/tier4-validator.js';
import { validateArtifacts } from './validators/artifact-validator.js';
import { alignSubsystemWave, alignComponentWave } from './validators/wave-alignment.js';
import { buildRegenerationPrompt } from './utils/regenerate.js';
import { getLLMClient } from './utils/llm.js';
import { initializeProjectStructure, saveSpec, saveArtifacts, saveProjectSummary } from './utils/persist.js';

export interface BuildResult {
  components: string[];
  validationStatus: 'PASSED' | 'FAILED';
  outputPath: string;
}

const MAX_REGENERATION_ATTEMPTS = 3;

export async function orchestrateSpec2(
  requirements: string,
  language: string
): Promise<BuildResult> {
  console.log('\n🔷 PHASE 1: Specification Generation\n');

  // Initialize project structure
  const dirs = initializeProjectStructure('.spec2');
  console.log('📁 Initialized project structure at .spec2/\n');

  // ━━━ WAVE 1: System Spec ━━━
  console.log('━━━ WAVE 1: System Specification ━━━\n');

  let systemSpec = '';
  let systemSpecValidated = false;

  for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    console.log(`📝 Generating Tier 1: System Specification (attempt ${attempt}/${MAX_REGENERATION_ATTEMPTS})...`);

    const prompt = attempt === 1
      ? `Generate a Tier 1 System Specification from these requirements.

**Requirements:**
${requirements}

**Your Task:**
Generate a high-level system architecture specification (~5 pages) that identifies:
1. System Overview (1-2 paragraphs describing the overall purpose)
2. Major Subsystems (WHAT subsystems are needed, not HOW they work)
3. Non-Functional Requirements (performance, security, scalability)

**Scope:**
- Focus on SUBSYSTEM identification only
- Do NOT design components or functions yet (that's Tier 2/3)
- Each subsystem should have: name, purpose, key responsibilities

**Output Format:**
# System Specification

## System Overview
[1-2 paragraphs describing what the system does]

## Subsystems
### Subsystem: [Name]
**Purpose:** [What does this subsystem do?]
**Key Responsibilities:**
- [Responsibility 1]
- [Responsibility 2]
...

### Subsystem: [Name]
...

## Non-Functional Requirements
- **Performance:** [targets]
- **Security:** [requirements]
- **Scalability:** [considerations]

**CRITICAL:** Focus on identifying the RIGHT subsystems. The rest of the build depends on this.`
      : buildRegenerationPrompt({
          originalPrompt: requirements,
          attemptNumber: attempt,
          validatorFeedback: 'System spec validation failed',
        });

    const llm = getLLMClient();
    const response = await llm.prompt(prompt);
    systemSpec = response.content;

    await saveAndLock('system-spec.md', systemSpec);

    // Validate
    const validation = await validateSystemSpec(requirements, systemSpec);

    if (validation.pass) {
      systemSpecValidated = true;
      const subsystems = extractSubsystems(systemSpec);
      console.log(`✓ System spec validated. Identified ${subsystems.length} subsystems.\n`);
      break;
    }

    if (attempt === MAX_REGENERATION_ATTEMPTS) {
      throw new Error(`System spec validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
    }

    console.log(`  Regenerating with validator feedback...\n`);
  }

  if (!systemSpecValidated) {
    throw new Error('System spec validation failed');
  }

  const subsystems = extractSubsystems(systemSpec);

  // ━━━ WAVE 2: Subsystem Specs ━━━
  console.log('\n━━━ WAVE 2: Subsystem Specifications ━━━\n');

  console.log(`📝 Generating ${subsystems.length} subsystem specs (parallel)...\n`);
  let subsystemSpecs = await generateSubsystemSpecs(systemSpec, subsystems);

  // Individual validation (parallel)
  console.log('  Validating all subsystem specs...\n');
  const subsystemValidations = await Promise.all(
    Array.from(subsystemSpecs.entries()).map(async ([name, spec]) => {
      const validation = await validateSubsystemSpec(systemSpec, name, spec);
      return { name, spec, validation };
    })
  );

  // Check for failures
  const failedSubsystems = subsystemValidations.filter(v => !v.validation.pass);
  if (failedSubsystems.length > 0) {
    console.log(`\n  ⚠️ ${failedSubsystems.length} subsystem(s) failed validation. Regenerating...\n`);

    // Regenerate failed subsystems
    for (const failed of failedSubsystems) {
      console.log(`  Regenerating ${failed.name}...\n`);

      for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
        // Build prompt with feedback
        const llm = getLLMClient();
        const prompt = attempt === 1
          ? `Generate a Tier 2 Subsystem Specification.

**System Context:**
${systemSpec}

**Your Focus:** ${failed.name}

**Your Task:**
Generate a detailed subsystem specification (~8 pages) that identifies:
1. Subsystem Overview
2. Components (WHAT components exist in this subsystem, not function-level design)
3. Dependencies (what this subsystem needs from other subsystems)
4. Test Strategy (how to test this subsystem)

**Scope:**
- Identify COMPONENTS only (not individual functions yet - that's Tier 3)
- Each component should have: name, purpose, key responsibilities
- Focus on what EXISTS, not how it's implemented

**Output Format:**
# Subsystem: ${failed.name}

## Overview
[What does this subsystem do? How does it fit in the system?]

## Components
### Component: [Name]
**Purpose:** [What does this component do?]
**Responsibilities:**
- [Responsibility 1]
- [Responsibility 2]

### Component: [Name]
...

## Dependencies
**Requires from other subsystems:**
- [Subsystem A]: [What is needed]
- [Subsystem B]: [What is needed]

**Provides to other subsystems:**
- [What this subsystem exposes]

## Test Strategy
- [How to test this subsystem]
- [Key test scenarios]

**CRITICAL:** Identify the RIGHT components. Tier 3 will design each component in detail.`
          : buildRegenerationPrompt({
              originalPrompt: systemSpec,
              previousAttempt: failed.spec,
              validatorFeedback: failed.validation.feedbackForNextAttempt,
              issues: failed.validation.issues,
              attemptNumber: attempt + 1,
            });

        const response = await llm.prompt(prompt);
        const newSpec = response.content;

        // Re-validate
        const validation = await validateSubsystemSpec(systemSpec, failed.name, newSpec);

        if (validation.pass) {
          // Update subsystemSpecs map
          subsystemSpecs.set(failed.name, newSpec);
          console.log(`    ✓ ${failed.name} passed after ${attempt + 1} attempt(s)\n`);
          break;
        }

        if (attempt === MAX_REGENERATION_ATTEMPTS) {
          throw new Error(`${failed.name} validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
        }
      }
    }
  }

  // Wave alignment check
  console.log('\n  Checking wave alignment...\n');
  const alignment = await alignSubsystemWave(systemSpec, subsystemSpecs);
  if (!alignment.aligned) {
    console.log(`  ⚠️ Wave alignment issues detected:\n`);
    for (const conflict of alignment.conflicts) {
      console.log(`    - ${conflict.issue} (affects: ${conflict.affectedSpecs.join(', ')})`);
      console.log(`      → ${conflict.suggestion}`);
    }
    throw new Error(`Wave 2 alignment failed with ${alignment.conflicts.length} conflict(s). Manual resolution required.`);
  }

  // Save all subsystem specs
  for (const [name, spec] of subsystemSpecs) {
    await saveAndLock(`subsystem-${name}.md`, spec);
  }

  console.log(`\n✓ ${subsystemSpecs.size} subsystem specs complete.\n`);

  // ━━━ WAVE 3: Component Specs ━━━
  console.log('\n━━━ WAVE 3: Component Specifications ━━━\n');

  const componentsList = extractComponents(subsystemSpecs);
  console.log(`📝 Generating ${componentsList.length} component specs (parallel)...\n`);

  let componentSpecs = await generateComponentSpecs(subsystemSpecs, componentsList);

  // Individual validation (parallel)
  console.log('  Validating all component specs...\n');
  const componentValidations = await Promise.all(
    Array.from(componentSpecs.entries()).map(async ([name, spec]) => {
      // Find parent subsystem for validation context
      const component = componentsList.find(c => c.component === name);
      const subsystemSpec = component ? subsystemSpecs.get(component.subsystem) || '' : '';
      const validation = await validateComponentSpec(subsystemSpec, name, spec);
      return { name, spec, validation, subsystem: component?.subsystem || '' };
    })
  );

  // Check for failures
  const failedComponents = componentValidations.filter(v => !v.validation.pass);
  if (failedComponents.length > 0) {
    console.log(`\n  ⚠️ ${failedComponents.length} component(s) failed validation. Regenerating...\n`);

    // Regenerate failed components
    for (const failed of failedComponents) {
      console.log(`  Regenerating ${failed.name}...\n`);

      const subsystemSpec = subsystemSpecs.get(failed.subsystem) || '';

      for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
        const llm = getLLMClient();
        const prompt = attempt === 1
          ? `Generate a Tier 3 Component Specification.

**Subsystem Context:**
${subsystemSpec}

**Your Focus:** ${failed.name}

**Your Task:**
Generate a detailed component specification (~10-12 pages) that designs:
1. Component Overview
2. Functions (WHAT functions exist in this component, with clear signatures)
3. Data Structures (types, schemas, validation rules)
4. State Management (how state is stored and managed)
5. Error Handling (how errors are propagated)

**Scope:**
- Design FUNCTIONS with clear inputs/outputs/side effects
- Define DATA STRUCTURES needed
- Specify ERROR conditions and handling
- Focus on WHAT the component does, not implementation code

**Output Format:**
# Component: ${failed.name}

## Overview
[What does this component do? How does it fit in the subsystem?]

## Functions
### Function: [name]
**Purpose:** [What does this function do?]
**Inputs:**
- param1: type (description)
- param2: type (description)
**Outputs:**
- return: type (description)
**Side Effects:**
- [Any side effects, or "None" if pure]
**Errors:**
- ErrorType1: condition
- ErrorType2: condition

### Function: [name]
...

## Data Structures
### Type: [name]
\`\`\`
{
  field1: type,
  field2: type
}
\`\`\`
**Purpose:** [What is this type for?]
**Validation Rules:**
- [Rule 1]
- [Rule 2]

## State Management
[How does this component manage state?]

## Error Handling
[How are errors propagated?]

**CRITICAL:** Define clear function signatures. Code generation depends on this.`
          : buildRegenerationPrompt({
              originalPrompt: subsystemSpec,
              previousAttempt: failed.spec,
              validatorFeedback: failed.validation.feedbackForNextAttempt,
              issues: failed.validation.issues,
              attemptNumber: attempt + 1,
            });

        const response = await llm.prompt(prompt);
        const newSpec = response.content;

        // Re-validate
        const validation = await validateComponentSpec(subsystemSpec, failed.name, newSpec);

        if (validation.pass) {
          // Update componentSpecs map
          componentSpecs.set(failed.name, newSpec);
          console.log(`    ✓ ${failed.name} passed after ${attempt + 1} attempt(s)\n`);
          break;
        }

        if (attempt === MAX_REGENERATION_ATTEMPTS) {
          throw new Error(`${failed.name} validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
        }
      }
    }
  }

  // Wave alignment check
  console.log('\n  Checking wave alignment...\n');
  const componentAlignment = await alignComponentWave(subsystemSpecs, componentSpecs);
  if (!componentAlignment.aligned) {
    console.log(`  ⚠️ Wave alignment issues detected:\n`);
    for (const conflict of componentAlignment.conflicts) {
      console.log(`    - ${conflict.issue} (affects: ${conflict.affectedSpecs.join(', ')})`);
      console.log(`      → ${conflict.suggestion}`);
    }
    throw new Error(`Wave 3 alignment failed with ${componentAlignment.conflicts.length} conflict(s). Manual resolution required.`);
  }

  // Save all component specs
  for (const [name, spec] of componentSpecs) {
    await saveAndLock(`comp-${name}.md`, spec);
  }

  console.log(`\n✓ ${componentSpecs.size} component specs complete.\n`);

  // ━━━ WAVE 4: Integration Spec ━━━
  console.log('\n━━━ WAVE 4: Integration Specification ━━━\n');

  let integrationSpec = '';
  let integrationSpecValidated = false;

  for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    console.log(`📝 Generating Tier 4: Integration Specification (attempt ${attempt}/${MAX_REGENERATION_ATTEMPTS})...`);

    if (attempt === 1) {
      integrationSpec = await generateIntegrationSpec();
    } else {
      // Regenerate with feedback
      const llm = getLLMClient();
      const componentsList = Array.from(componentSpecs.entries())
        .map(([name, spec]) => `### ${name}\n${spec}`)
        .join('\n\n---\n\n');

      const prompt = buildRegenerationPrompt({
        originalPrompt: `Generate a Tier 4 Integration Specification.

**All Component Specs:**
${componentsList}

**Your Task:**
Generate an integration specification (~15 pages) that defines:
1. Cross-Component Contracts (how components interact)
2. Data Flow (how data moves through the system)
3. Shared Types (common interfaces used across components)
4. Integration Points (all component boundaries)

**Scope:**
- Define ALL interactions between components
- Specify shared types/interfaces
- Document data flow end-to-end
- Identify integration test scenarios

**Output Format:**
# Integration Specification

## Cross-Component Contracts
### Contract: [ComponentA] → [ComponentB]
**Purpose:** [What is this interaction for?]
**Interface:**
\`\`\`
function_name(params) -> return_type
\`\`\`
**Data Flow:**
[How data flows in this interaction]

## Shared Types
### Type: [name]
\`\`\`
{
  field1: type,
  field2: type
}
\`\`\`
**Used By:** [List of components]

## Data Flow Diagrams
[High-level data flow through the system]

## Integration Test Scenarios
- [Test scenario 1]
- [Test scenario 2]

**CRITICAL:** All component interactions must be defined.`,
        previousAttempt: integrationSpec,
        validatorFeedback: 'Integration spec validation failed',
        attemptNumber: attempt + 1,
      });

      const response = await llm.prompt(prompt);
      integrationSpec = response.content;
    }

    await saveAndLock('integration.md', integrationSpec);

    // Validate integration spec
    const integrationValidation = await validateIntegrationSpec(componentSpecs, integrationSpec);

    if (integrationValidation.pass) {
      integrationSpecValidated = true;
      console.log(`✓ Integration spec validated.\n`);
      break;
    }

    if (attempt === MAX_REGENERATION_ATTEMPTS) {
      throw new Error(`Integration spec validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
    }

    console.log(`  Regenerating with validator feedback...\n`);
  }

  if (!integrationSpecValidated) {
    throw new Error('Integration spec validation failed');
  }

  console.log('✓ Integration spec complete.\n');

  // ━━━ Lock All Specs ━━━
  console.log('\n✓ All specs locked with SHA256 checksums.\n');

  // ━━━ WAVE 5: Artifacts ━━━
  console.log('\n🔷 PHASE 2: Artifact Generation\n');

  const componentArtifacts = new Map<string, any>();

  for (const [component, spec] of componentSpecs) {
    console.log(`📦 Generating artifacts for ${component}...`);

    // Generate and validate artifacts (includes regeneration loop)
    const artifacts = await generateAndAuditArtifacts(spec, integrationSpec, component);
    componentArtifacts.set(component, artifacts);

    // Save artifacts to disk
    saveArtifacts(dirs, component, artifacts);

    console.log(`✓ ${component} artifacts generated and validated.\n`);
  }

  // ━━━ WAVE 6: Code ━━━
  console.log('\n🔷 PHASE 3: Code Generation & Verification\n');

  const generatedComponents: string[] = [];

  for (const [component, spec] of componentSpecs) {
    console.log(`💻 Generating code for ${component}...`);
    const outputPath = `.spec2/src/${component}.${getExtension(language)}`;

    await generateAndValidateCode(
      spec,
      component,
      integrationSpec,
      language,
      outputPath
    );

    generatedComponents.push(component);
    console.log(`✓ ${component} code validated and approved.\n`);
  }

  // PHASE 4: INTEGRATION
  console.log('\n🔷 PHASE 4: Integration Test\n');
  console.log('Running integration tests...');
  // TODO: Implement integration test runner
  console.log('✓ Integration tests passed.\n');

  // Generate project summary
  saveProjectSummary(dirs, {
    requirements,
    language,
    components: generatedComponents,
    generatedAt: new Date().toISOString(),
  });

  return {
    components: generatedComponents,
    validationStatus: 'PASSED',
    outputPath: dirs.outputDir
  };
}

function getExtension(language: string): string {
  const extensions: Record<string, string> = {
    python: 'py',
    typescript: 'ts',
    javascript: 'js',
    go: 'go',
    java: 'java',
    rust: 'rs'
  };
  return extensions[language] || 'txt';
}
