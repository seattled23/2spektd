/**
 * Main orchestration logic for Spec2
 *
 * Implements wave-based validation with:
 * - Individual validators (fresh agents) after each spec
 * - Wave alignment validators for cross-spec consistency
 * - Feedback loops for regeneration (max 3 attempts)
 * - Parallel execution within waves with sync barriers
 *
 * Architecture note on "shared context":
 * The Ctx object below holds ONLY orchestrator-local state — the same
 * variables that used to be function-locals. No fresh agent sees Ctx;
 * each agent gets its scoped slice via explicit arguments, preserving
 * the isolation contract (system spec = read-only NFR context for
 * downstream tiers, parent tier spec = design target, never siblings).
 */

import { generateSystemSpec } from './agents/tier1.js';
import { generateSubsystemSpecs } from './agents/tier2.js';
import { generateComponentSpecs } from './agents/tier3.js';
import { generateIntegrationSpec } from './agents/tier4.js';
import { generateAndAuditArtifacts } from './agents/artifact.js';
import { generateAndValidateCode } from './agents/codegen.js';
import { getExtensionForLanguage } from './packs/index.js';
import { extractSubsystems, extractComponents } from './utils/extract.js';
import { saveAndLock } from './utils/lock.js';
import { validateSystemSpec } from './validators/tier1-validator.js';
import { validateSubsystemSpec } from './validators/tier2-validator.js';
import { validateComponentSpec } from './validators/tier3-validator.js';
import { validateIntegrationSpec } from './validators/tier4-validator.js';
import { alignSubsystemWave, alignComponentWave } from './validators/wave-alignment.js';
import { buildRegenerationPrompt } from './utils/regenerate.js';
import { getLLMClient } from './utils/llm.js';
import {
  initializeProjectStructure,
  saveArtifacts,
  saveProjectSummary,
  type ProjectPersistence,
} from './utils/persist.js';
import { saveCheckpoint, type Checkpoint } from './utils/checkpoint.js';
import { initRegistry, ingestComponent as registryIngest } from './registry/index.js';
import {
  generateSystemReview,
  generateSubsystemReview,
  generateComponentReview,
  generateIntegrationReview,
} from './review/index.js';

export interface BuildResult {
  components: string[];
  validationStatus: 'PASSED' | 'FAILED';
  outputPath: string;
}

const MAX_REGENERATION_ATTEMPTS = 3;

/**
 * Wrapper for review-package generation. Reviews are human-facing artifacts;
 * a failure to render one must NEVER fail the pipeline. Log and continue.
 */
function safeGenerateReview(
  fn: () => { path: string; warnings: string[] },
  label: string,
): void {
  try {
    const result = fn();
    if (result.warnings.length > 0) {
      console.warn(
        `  ⚠️ review[${label}] generated with ${result.warnings.length} parse warning(s) → ${result.path}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  ⚠️ review[${label}] skipped: ${msg}`);
  }
}

/**
 * Orchestrator state — carried between waves.
 * Populated progressively by runWave1..runWave6.
 * Never passed to an LLM; each wave extracts the scoped slice it needs.
 */
interface Ctx {
  requirements: string;
  language: string;
  dirs: ProjectPersistence;
  systemSpec: string;
  subsystems: string[];
  subsystemSpecs: Map<string, string>;
  components: string[];
  componentSpecs: Map<string, string>;
  integrationSpec: string;
  componentArtifacts: Map<string, any>;
  generatedComponents: string[];
}

function newCtx(requirements: string, language: string): Ctx {
  return {
    requirements,
    language,
    dirs: initializeProjectStructure('.spec2'),
    systemSpec: '',
    subsystems: [],
    subsystemSpecs: new Map(),
    components: [],
    componentSpecs: new Map(),
    integrationSpec: '',
    componentArtifacts: new Map(),
    generatedComponents: [],
  };
}

function ctxFromCheckpoint(cp: Checkpoint): Ctx {
  const dirs = initializeProjectStructure('.spec2'); // idempotent
  const componentSpecs = new Map(Object.entries(cp.componentSpecs ?? {}));
  const ctx: Ctx = {
    requirements: cp.requirements,
    language: cp.language,
    dirs,
    systemSpec: cp.systemSpec ?? '',
    subsystems: cp.subsystems ?? [],
    subsystemSpecs: new Map(Object.entries(cp.subsystemSpecs ?? {})),
    components: cp.components ?? [],
    componentSpecs,
    integrationSpec: cp.integrationSpec ?? '',
    componentArtifacts: new Map(Object.entries(cp.artifacts ?? {})),
    generatedComponents: cp.generatedComponents ?? [],
  };

  // If the checkpoint has component specs (wave3+), rebuild the registry so
  // runWave4 can query it even if registry.db doesn't exist (e.g., checkpoint
  // from v1.1.0 which predates the registry).
  if (componentSpecs.size > 0) {
    rebuildRegistry(componentSpecs, cp.subsystemSpecs ?? {});
  }

  return ctx;
}

/**
 * Initialize the registry and populate it from a component spec map.
 * Called from Wave 3 (after validation) and from ctxFromCheckpoint (resume).
 * The subsystemSpecs map is used to derive the subsystem for each component.
 * Idempotent: re-runs cleanly if registry.db already exists.
 */
function rebuildRegistry(
  componentSpecs: Map<string, string>,
  subsystemSpecsObj: Record<string, string>
): void {
  const dbPath = '.spec2/registry.db';
  initRegistry(dbPath);

  // Build a component → subsystem lookup from subsystem spec text
  // (subsystem spec lists "### Component: name" entries)
  const componentToSubsystem = new Map<string, string>();
  for (const [subsystem, subsystemSpec] of Object.entries(subsystemSpecsObj)) {
    const componentNames = subsystemSpec.match(/###\s+Component:\s+(\w[\w\s-]*)/gi) ?? [];
    for (const match of componentNames) {
      const name = match.replace(/###\s+Component:\s+/i, '').trim();
      componentToSubsystem.set(name, subsystem);
    }
  }

  for (const [name, specText] of componentSpecs) {
    const subsystem = componentToSubsystem.get(name) ?? '';
    const specPath = `.spec2/specs/comp-${name}.md`;
    registryIngest(name, subsystem, specText, specPath);
  }
  console.log(`  📋 Registry: ingested ${componentSpecs.size} component(s) into .spec2/registry.db`);
}

// ═══════════════════════════════════════════════════════════════════════
//  ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════

export async function orchestrateSpec2(
  requirements: string,
  language: string
): Promise<BuildResult> {
  console.log('\n🔷 PHASE 1: Specification Generation\n');
  const ctx = newCtx(requirements, language);
  console.log('📁 Initialized project structure at .spec2/\n');

  await runWave1(ctx);
  await runWave2(ctx);
  await runWave3(ctx);
  await runWave4(ctx);
  await runWave5(ctx);
  return await runWave6(ctx);
}

/**
 * Resume orchestration from a checkpoint.
 * Skips completed waves; re-runs the wave *after* the checkpoint's phase.
 */
export async function orchestrateSpec2FromCheckpoint(
  checkpoint: Checkpoint
): Promise<BuildResult> {
  console.log(`\n🔄 Resuming from checkpoint (last completed: ${checkpoint.phase})...\n`);
  const ctx = ctxFromCheckpoint(checkpoint);

  switch (checkpoint.phase) {
    case 'wave1':
      await runWave2(ctx);
      await runWave3(ctx);
      await runWave4(ctx);
      await runWave5(ctx);
      return await runWave6(ctx);
    case 'wave2':
      await runWave3(ctx);
      await runWave4(ctx);
      await runWave5(ctx);
      return await runWave6(ctx);
    case 'wave3':
      await runWave4(ctx);
      await runWave5(ctx);
      return await runWave6(ctx);
    case 'wave4':
      await runWave5(ctx);
      return await runWave6(ctx);
    case 'wave5':
      return await runWave6(ctx);
    case 'wave6':
    case 'complete':
      throw new Error('Build already complete, nothing to resume');
    default:
      throw new Error(`Unknown checkpoint phase: ${(checkpoint as any).phase}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  WAVE FUNCTIONS — each mutates ctx in-place and saves a checkpoint
// ═══════════════════════════════════════════════════════════════════════

async function runWave1(ctx: Ctx): Promise<void> {
  console.log('━━━ WAVE 1: System Specification ━━━\n');

  let systemSpec = '';
  let validated = false;

  for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    console.log(`📝 Generating Tier 1: System Specification (attempt ${attempt}/${MAX_REGENERATION_ATTEMPTS})...`);

    const prompt = attempt === 1
      ? `Generate a Tier 1 System Specification from these requirements.

**Requirements:**
${ctx.requirements}

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
          originalPrompt: ctx.requirements,
          attemptNumber: attempt,
          validatorFeedback: 'System spec validation failed',
        });

    const llm = getLLMClient();
    const response = await llm.prompt(prompt);
    systemSpec = response.content;

    await saveAndLock('system-spec.md', systemSpec);

    const validation = await validateSystemSpec(ctx.requirements, systemSpec);
    if (validation.pass) {
      validated = true;
      const subsystems = extractSubsystems(systemSpec);
      console.log(`✓ System spec validated. Identified ${subsystems.length} subsystems.\n`);
      break;
    }

    if (attempt === MAX_REGENERATION_ATTEMPTS) {
      throw new Error(`System spec validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
    }
    console.log(`  Regenerating with validator feedback...\n`);
  }

  if (!validated) throw new Error('System spec validation failed');

  ctx.systemSpec = systemSpec;
  ctx.subsystems = extractSubsystems(systemSpec);

  safeGenerateReview(() =>
    generateSystemReview({ outputDir: ctx.dirs.outputDir }, ctx.systemSpec),
    'system',
  );

  saveCheckpoint({
    phase: 'wave1',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
  });
}

async function runWave2(ctx: Ctx): Promise<void> {
  console.log('\n━━━ WAVE 2: Subsystem Specifications ━━━\n');

  console.log(`📝 Generating ${ctx.subsystems.length} subsystem specs (parallel)...\n`);
  ctx.subsystemSpecs = await generateSubsystemSpecs(ctx.systemSpec, ctx.subsystems);

  console.log('  Validating all subsystem specs...\n');
  const validations = await Promise.all(
    Array.from(ctx.subsystemSpecs.entries()).map(async ([name, spec]) => {
      const validation = await validateSubsystemSpec(ctx.systemSpec, name, spec);
      return { name, spec, validation };
    })
  );

  const failed = validations.filter(v => !v.validation.pass);
  if (failed.length > 0) {
    console.log(`\n  ⚠️ ${failed.length} subsystem(s) failed validation. Regenerating...\n`);

    for (const f of failed) {
      console.log(`  Regenerating ${f.name}...\n`);

      for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
        const llm = getLLMClient();
        const prompt = attempt === 1
          ? `Generate a Tier 2 Subsystem Specification.

**System Context:**
${ctx.systemSpec}

**Your Focus:** ${f.name}

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

**Dependencies — RIGOROUS REQUIREMENT:**
For every external subsystem you depend on, you MUST name the exact contract surface
(functions/types/endpoints) you consume. "Uses LoggingService" is NOT acceptable;
"Uses LoggingService.emit(level, event, context) returning void" is acceptable.
Downstream component specs will NOT see sibling subsystems — your dependency
declarations are the ONLY way they learn what's available externally.

**Output Format:**
# Subsystem: ${f.name}

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
- [Subsystem A] :: [function/type/endpoint with signature] — [why needed]
- [Subsystem B] :: [function/type/endpoint with signature] — [why needed]

**Provides to other subsystems:**
- [function/type/event name] :: [signature] — [what it does]

## Test Strategy
- [How to test this subsystem]
- [Key test scenarios]

**CRITICAL:** Identify the RIGHT components. Tier 3 will design each component in detail.`
          : buildRegenerationPrompt({
              originalPrompt: ctx.systemSpec,
              previousAttempt: f.spec,
              validatorFeedback: f.validation.feedbackForNextAttempt,
              issues: f.validation.issues,
              attemptNumber: attempt + 1,
            });

        const response = await llm.prompt(prompt);
        const newSpec = response.content;

        const validation = await validateSubsystemSpec(ctx.systemSpec, f.name, newSpec);
        if (validation.pass) {
          ctx.subsystemSpecs.set(f.name, newSpec);
          console.log(`    ✓ ${f.name} passed after ${attempt + 1} attempt(s)\n`);
          break;
        }

        if (attempt === MAX_REGENERATION_ATTEMPTS) {
          throw new Error(`${f.name} validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
        }
      }
    }
  }

  console.log('\n  Checking wave alignment...\n');
  const alignment = await alignSubsystemWave(ctx.systemSpec, ctx.subsystemSpecs);
  if (!alignment.aligned) {
    console.log(`  ⚠️ Wave alignment issues detected:\n`);
    for (const c of alignment.conflicts) {
      console.log(`    - ${c.issue} (affects: ${c.affectedSpecs.join(', ')})`);
      console.log(`      → ${c.suggestion}`);
    }
    throw new Error(`Wave 2 alignment failed with ${alignment.conflicts.length} conflict(s). Manual resolution required.`);
  }

  for (const [name, spec] of ctx.subsystemSpecs) {
    await saveAndLock(`subsystem-${name}.md`, spec);
    safeGenerateReview(
      () => generateSubsystemReview({ outputDir: ctx.dirs.outputDir }, name, spec),
      `subsystem(${name})`,
    );
  }
  console.log(`\n✓ ${ctx.subsystemSpecs.size} subsystem specs complete.\n`);

  saveCheckpoint({
    phase: 'wave2',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
    subsystemSpecs: Object.fromEntries(ctx.subsystemSpecs),
  });
}

async function runWave3(ctx: Ctx): Promise<void> {
  console.log('\n━━━ WAVE 3: Component Specifications ━━━\n');

  const componentsList = extractComponents(ctx.subsystemSpecs);
  console.log(`📝 Generating ${componentsList.length} component specs (parallel)...\n`);

  // Tier 3 generator now receives systemSpec as read-only SYSTEM CONTEXT
  ctx.componentSpecs = await generateComponentSpecs(
    ctx.subsystemSpecs,
    componentsList,
    ctx.systemSpec
  );

  console.log('  Validating all component specs...\n');
  const validations = await Promise.all(
    Array.from(ctx.componentSpecs.entries()).map(async ([name, spec]) => {
      const component = componentsList.find(c => c.component === name);
      const subsystemSpec = component ? ctx.subsystemSpecs.get(component.subsystem) || '' : '';
      const validation = await validateComponentSpec(subsystemSpec, name, spec);
      return { name, spec, validation, subsystem: component?.subsystem || '' };
    })
  );

  const failed = validations.filter(v => !v.validation.pass);
  if (failed.length > 0) {
    console.log(`\n  ⚠️ ${failed.length} component(s) failed validation. Regenerating...\n`);

    for (const f of failed) {
      console.log(`  Regenerating ${f.name}...\n`);
      const subsystemSpec = ctx.subsystemSpecs.get(f.subsystem) || '';

      for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
        const llm = getLLMClient();
        const systemContextBlock = ctx.systemSpec
          ? `**SYSTEM CONTEXT (read-only, for NFR awareness — DO NOT design from this directly):**
${ctx.systemSpec}

---

`
          : '';
        const prompt = attempt === 1
          ? `Generate a Tier 3 Component Specification.

${systemContextBlock}**Subsystem Context (YOUR DESIGN TARGET):**
${subsystemSpec}

**Your Focus:** ${f.name}

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
- You can ONLY consume external contracts listed in the parent subsystem's Dependencies section

**Output Format:**
# Component: ${f.name}

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
              previousAttempt: f.spec,
              validatorFeedback: f.validation.feedbackForNextAttempt,
              issues: f.validation.issues,
              attemptNumber: attempt + 1,
            });

        const response = await llm.prompt(prompt);
        const newSpec = response.content;

        const validation = await validateComponentSpec(subsystemSpec, f.name, newSpec);
        if (validation.pass) {
          ctx.componentSpecs.set(f.name, newSpec);
          console.log(`    ✓ ${f.name} passed after ${attempt + 1} attempt(s)\n`);
          break;
        }

        if (attempt === MAX_REGENERATION_ATTEMPTS) {
          throw new Error(`${f.name} validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
        }
      }
    }
  }

  console.log('\n  Checking wave alignment...\n');
  const alignment = await alignComponentWave(ctx.subsystemSpecs, ctx.componentSpecs);
  if (!alignment.aligned) {
    console.log(`  ⚠️ Wave alignment issues detected:\n`);
    for (const c of alignment.conflicts) {
      console.log(`    - ${c.issue} (affects: ${c.affectedSpecs.join(', ')})`);
      console.log(`      → ${c.suggestion}`);
    }
    throw new Error(`Wave 3 alignment failed with ${alignment.conflicts.length} conflict(s). Manual resolution required.`);
  }

  for (const [name, spec] of ctx.componentSpecs) {
    await saveAndLock(`comp-${name}.md`, spec);
    safeGenerateReview(
      () => generateComponentReview({ outputDir: ctx.dirs.outputDir }, name, spec),
      `component(${name})`,
    );
  }
  console.log(`\n✓ ${ctx.componentSpecs.size} component specs complete.\n`);

  ctx.components = Array.from(ctx.componentSpecs.keys());

  // Build the integration registry from validated component specs.
  // Orchestrator-local state: registry is never passed to an LLM directly.
  rebuildRegistry(ctx.componentSpecs, Object.fromEntries(ctx.subsystemSpecs));

  saveCheckpoint({
    phase: 'wave3',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
    subsystemSpecs: Object.fromEntries(ctx.subsystemSpecs),
    components: ctx.components,
    componentSpecs: Object.fromEntries(ctx.componentSpecs),
  });
}

async function runWave4(ctx: Ctx): Promise<void> {
  console.log('\n━━━ WAVE 4: Integration Specification ━━━\n');

  let integrationSpec = '';
  let validated = false;

  for (let attempt = 1; attempt <= MAX_REGENERATION_ATTEMPTS; attempt++) {
    console.log(`📝 Generating Tier 4: Integration Specification (attempt ${attempt}/${MAX_REGENERATION_ATTEMPTS})...`);

    if (attempt === 1) {
      // Tier 4 gets systemSpec as read-only SYSTEM CONTEXT
      integrationSpec = await generateIntegrationSpec(ctx.systemSpec);
    } else {
      const llm = getLLMClient();
      const componentsList = Array.from(ctx.componentSpecs.entries())
        .map(([name, spec]) => `### ${name}\n${spec}`)
        .join('\n\n---\n\n');

      const systemContextBlock = ctx.systemSpec
        ? `**SYSTEM CONTEXT (read-only, for NFR awareness):**
${ctx.systemSpec}

---

`
        : '';

      const prompt = buildRegenerationPrompt({
        originalPrompt: `Generate a Tier 4 Integration Specification.

${systemContextBlock}**All Component Specs:**
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

    const validation = await validateIntegrationSpec(ctx.componentSpecs, integrationSpec);
    if (validation.pass) {
      validated = true;
      console.log(`✓ Integration spec validated.\n`);
      break;
    }

    if (attempt === MAX_REGENERATION_ATTEMPTS) {
      throw new Error(`Integration spec validation failed after ${MAX_REGENERATION_ATTEMPTS} attempts`);
    }
    console.log(`  Regenerating with validator feedback...\n`);
  }

  if (!validated) throw new Error('Integration spec validation failed');
  console.log('✓ Integration spec complete.\n');

  ctx.integrationSpec = integrationSpec;

  safeGenerateReview(
    () => generateIntegrationReview({ outputDir: ctx.dirs.outputDir }, ctx.integrationSpec),
    'integration',
  );

  saveCheckpoint({
    phase: 'wave4',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
    subsystemSpecs: Object.fromEntries(ctx.subsystemSpecs),
    components: ctx.components,
    componentSpecs: Object.fromEntries(ctx.componentSpecs),
    integrationSpec: ctx.integrationSpec,
  });

  console.log('\n✓ All specs locked with SHA256 checksums.\n');
}

async function runWave5(ctx: Ctx): Promise<void> {
  console.log('\n🔷 PHASE 2: Artifact Generation\n');

  // Resume-safe: skip components whose artifacts already exist in ctx
  for (const [component, spec] of ctx.componentSpecs) {
    if (ctx.componentArtifacts.has(component)) {
      console.log(`⏭️  Skipping ${component} (artifacts already generated)`);
      continue;
    }

    console.log(`📦 Generating artifacts for ${component}...`);
    const artifacts = await generateAndAuditArtifacts(
      spec,
      ctx.integrationSpec,
      component,
      ctx.systemSpec
    );
    ctx.componentArtifacts.set(component, artifacts);
    saveArtifacts(ctx.dirs, component, artifacts);
    console.log(`✓ ${component} artifacts generated and validated.\n`);
  }

  saveCheckpoint({
    phase: 'wave5',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
    subsystemSpecs: Object.fromEntries(ctx.subsystemSpecs),
    components: ctx.components,
    componentSpecs: Object.fromEntries(ctx.componentSpecs),
    integrationSpec: ctx.integrationSpec,
    artifacts: Object.fromEntries(ctx.componentArtifacts),
  });
}

async function runWave6(ctx: Ctx): Promise<BuildResult> {
  console.log('\n🔷 PHASE 3: Code Generation & Verification\n');

  for (const [component, spec] of ctx.componentSpecs) {
    if (ctx.generatedComponents.includes(component)) {
      console.log(`⏭️  Skipping ${component} (code already generated)`);
      continue;
    }

    console.log(`💻 Generating code for ${component}...`);
    const outputPath = `.spec2/src/${component}.${getExtension(ctx.language)}`;

    await generateAndValidateCode(
      spec,
      component,
      ctx.integrationSpec,
      ctx.language,
      outputPath,
      ctx.systemSpec
    );

    ctx.generatedComponents.push(component);
    console.log(`✓ ${component} code validated and approved.\n`);
  }

  console.log('\n🔷 PHASE 4: Integration Test\n');
  // Integration test runner is not implemented in v1.2.0 — see ROADMAP §3 Tier 2.
  // We intentionally do not print a fake "passed" log here.

  saveProjectSummary(ctx.dirs, {
    requirements: ctx.requirements,
    language: ctx.language,
    components: ctx.generatedComponents,
    generatedAt: new Date().toISOString(),
  });

  saveCheckpoint({
    phase: 'complete',
    timestamp: new Date().toISOString(),
    requirements: ctx.requirements,
    language: ctx.language,
    systemSpec: ctx.systemSpec,
    subsystems: ctx.subsystems,
    subsystemSpecs: Object.fromEntries(ctx.subsystemSpecs),
    components: ctx.components,
    componentSpecs: Object.fromEntries(ctx.componentSpecs),
    integrationSpec: ctx.integrationSpec,
    artifacts: Object.fromEntries(ctx.componentArtifacts),
    generatedComponents: ctx.generatedComponents,
  });

  return {
    components: ctx.generatedComponents,
    validationStatus: 'PASSED',
    outputPath: ctx.dirs.outputDir,
  };
}

// File extension is sourced from the LanguagePack registry (§8). Unregistered
// languages fall back to the built-in map inside getExtensionForLanguage.
function getExtension(language: string): string {
  return getExtensionForLanguage(language);
}
