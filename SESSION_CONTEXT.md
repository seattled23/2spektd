# spec2 Phase A Implementation - Session Context

**Date**: April 11, 2026
**Session**: Context about to be compacted
**Status**: Ready to begin Phase A implementation

---

## What We Discussed

### User Question
"Are you able to utilize spec2 properly now? Does it work correctly? Is it missing anything? Can you assign a sub agent to use it and have it work properly in the sub agent task?"

### Answer Summary

**Current State**:
- ✅ spec2 EXISTS and is FULLY FUNCTIONAL for manual orchestration
- ✅ All 4 language modules complete (Go, TypeScript, Python, Shell)
- ✅ 12-layer validation stack working
- ✅ Tested on real components
- ❌ NO automated agent launching (requires ~20 manual context switches per build)
- ❌ Skill invocation `/spec2:new` is documentation-only, doesn't execute
- ❌ Sub-agents (Task tool) CANNOT access spec2 at all

### Critical Insight: 4-Tier Progressive Narrowing

User correctly caught that I initially skipped Tier 3 in my explanation. The complete workflow is:

**TIER 1: System Spec** (30,000 ft)
- Scope: WHAT subsystems exist (not HOW they work)
- Output: ~5 pages
- Agent: 1 (sequential)
- Example: "We need: Auth, Dashboard UI, Metrics API, Data Store"

**TIER 2: Subsystem Specs** (10,000 ft)
- Scope: WHAT components exist in THIS subsystem (not function-level)
- Output: ~8 pages per subsystem
- Agents: N (PARALLEL - subsystems independent)
- Example: "Auth subsystem needs: Login, Logout, JWT Manager, Session Store"

**TIER 3: Component Specs** (Ground level) ← **MOST DETAILED TIER**
- Scope: FUNCTION LEVEL - signatures, acceptance criteria, test requirements
- Output: ~12 pages per component
- Agents: M (SEQUENTIAL - user reviews each carefully)
- Example: `login(email, password) → (token, error)` with @pre/@post/@error annotations

**TIER 4: Integration Spec** (Horizontal consistency)
- Scope: Cross-component concerns (shared types, contracts, data flow)
- Output: ~10 pages
- Agent: 1 (sequential)
- Example: "UserID string format: UUID v4", "Auth token format used by Dashboard UI"

### Why This Design Matters

**Progressive Narrowing Benefits**:
1. **Prevents scope creep** - Each agent has ONE focused job
2. **User review feasible** - 5-20 pages at a time, not 500 pages
3. **Agent isolation** - Can't see whole system to game validation
4. **Changes localized** - Modifications affect ONE tier, not everything

**Agent Isolation Prevents Reward Hacking**:
- Each agent gets FRESH context window
- No memory of other agents' reasoning
- Immutable inputs (locked specs from previous tiers)
- Cannot adjust specs to match bad code
- Cannot game validation by learning patterns

### Files Created

1. **2SPEKTD_INTEGRATION_ANALYSIS.md** (20 KB)
   - Gap analysis (what's missing)
   - 3-phase extension design (52 hours total)
   - Phase A: Core automation (20h)
   - Phase B: Sub-agent integration (12h)
   - Phase C: Gemini CLI bridge (20h)

2. **2SPEKTD_WORKFLOW_VISUAL.md** (59 KB)
   - Complete workflow overview diagram
   - Tier 1-4 progressive narrowing in ASCII art
   - Agent isolation model (with vs without)
   - Complete data flow from requirements → validated code
   - Immutability enforcement (lock mechanism)
   - Parallel vs sequential execution

---

## What Phase A Will Do

### Goal
Transform `/spec2:new "<requirements>"` from documentation to fully automated workflow.

### Current Manual Process (Painful)
```bash
./orchestrate-build.sh "Build analytics dashboard"

# Script prompts:
"📝 Action required (NEW session):
 Invoke: 'Generate Tier 1 spec from requirements'
 Save to: .spec2/specs/system-spec.md"

# User must:
1. Open new Claude Code session
2. Copy the prompt
3. Run the agent
4. Save output to file
5. Return to orchestrator
6. Press Enter to continue

# Repeat ~20 times for all tiers, all components
```

### After Phase A (Automated)
```bash
/spec2:new "Build analytics dashboard with real-time WebSocket updates"

# System automatically:
✅ Launches Tier 1 agent (system spec)
✅ Launches Tier 2 agents in PARALLEL (subsystem specs)
✅ Launches Tier 3 agents SEQUENTIALLY (component specs)
✅ Launches Tier 4 agent (integration spec)
✅ For each component:
   - Generates artifacts
   - Audits artifacts (fresh agent)
   - Generates code (one-shot)
   - Runs 12-layer validation
   - Fixes code (fresh agent per iteration) until pass
✅ Runs integration tests
✅ Reports final status

# User only needs to approve specs at each tier
# No manual context switching, no copying prompts
```

---

## Phase A Implementation Plan

### Step 1: Create Executable Skill (4 hours)

**Location**: `~/.claude/skills/spec2-new/`

**Files to create**:
```
skill.ts          - Entry point, exports execute() function
orchestrate.ts    - Main orchestration logic
agents/
  tier1.ts        - Tier 1 spec agent launcher
  tier2.ts        - Tier 2 spec agent launcher (parallel)
  tier3.ts        - Tier 3 spec agent launcher (sequential)
  tier4.ts        - Tier 4 integration agent launcher
  artifact.ts     - Artifact gen + audit agent launcher
  codegen.ts      - Code gen + fix agent launcher
utils/
  lock.ts         - Lock/unlock spec files (sha256)
  extract.ts      - Extract subsystems/components from specs
  validate.ts     - 12-layer validation runner
tsconfig.json     - TypeScript config
package.json      - Dependencies (@anthropic/sdk)
```

**Update**:
```markdown
SKILL.md - Add executable: true, entry_point: skill.ts
```

### Step 2: Implement Task-Based Agent Launching (8 hours)

**Key functions**:

```typescript
// agents/tier1.ts
async function generateSystemSpec(requirements: string): Promise<string> {
  const agent = await Task.launch({
    subagent_type: 'odin:architect',
    prompt: `Generate Tier 1 system specification.

    Requirements: ${requirements}

    Scope: Identify SUBSYSTEMS only (not components).

    Output format:
    ## System Overview
    ## Subsystems
    - Subsystem A: <purpose>
    - Subsystem B: <purpose>
    ## Non-Functional Requirements`,
    description: 'Generate system specification'
  });

  return await agent.result();
}

// agents/tier2.ts
async function generateSubsystemSpecs(
  systemSpec: string,
  subsystems: string[]
): Promise<Map<string, string>> {
  // Launch agents in PARALLEL
  const agents = subsystems.map(subsystem =>
    Task.launch({
      subagent_type: 'odin:architect',
      prompt: `Generate Tier 2 specification for subsystem: ${subsystem}

      From system spec: ${systemSpec}

      Scope: Identify COMPONENTS for ${subsystem} only (not functions).

      Output format:
      ## Subsystem: ${subsystem}
      ## Components
      - Component A: <purpose>
      ## Dependencies
      ## Test Strategy`,
      description: `Generate ${subsystem} spec`
    })
  );

  const results = await Promise.all(agents.map(a => a.result()));

  return new Map(subsystems.map((name, i) => [name, results[i]]));
}

// agents/tier3.ts
async function generateComponentSpecs(
  subsystemSpecs: Map<string, string>,
  components: {component: string, subsystem: string}[]
): Promise<Map<string, string>> {
  // SEQUENTIAL - user reviews each
  const specs = new Map<string, string>();

  for (const {component, subsystem} of components) {
    const agent = await Task.launch({
      subagent_type: getSpecialistAgent(subsystem),
      prompt: `Generate Tier 3 specification for component: ${component}

      From subsystem spec: ${subsystemSpecs.get(subsystem)}

      Scope: FUNCTION LEVEL - design actual API.

      Output format:
      ## Component: ${component}
      ## Functions
      - functionName(params) → returnType
        - @pre: preconditions
        - @post: postconditions
        - @error: error cases
        - Acceptance criteria: ...
        - Test requirements: ...`,
      description: `Generate ${component} spec`
    });

    const spec = await agent.result();
    specs.set(component, spec);

    // User approval checkpoint
    const approved = await askUserApproval(`Component spec: ${component}`, spec);
    if (!approved) {
      throw new Error(`User rejected ${component} spec`);
    }
  }

  return specs;
}
```

### Step 3: Implement Artifact Generation Loop (4 hours)

```typescript
// agents/artifact.ts
async function generateAndAuditArtifacts(
  componentSpec: string,
  integrationSpec: string,
  component: string
): Promise<void> {
  let auditPassed = false;
  let iteration = 1;

  while (!auditPassed && iteration <= 10) {
    // Generate artifacts (fresh agent)
    const genAgent = await Task.launch({
      subagent_type: 'odin:architect',
      prompt: `Generate validation artifacts for component: ${component}

      Component spec: ${componentSpec}
      Integration spec: ${integrationSpec}

      Generate:
      1. correspondence.json - Map properties to ≥3 layers
      2. completeness.json - All acceptance criteria covered
      3. test-requirements.md - Test cases
      4. architecture-baseline.json - Complexity baselines`,
      description: `Generate artifacts for ${component}`
    });

    const artifacts = await genAgent.result();
    await saveArtifacts(component, artifacts);

    // Audit artifacts (INDEPENDENT fresh agent)
    const auditAgent = await Task.launch({
      subagent_type: 'odin:investigator',
      prompt: `Audit validation artifacts for component: ${component}

      Component spec: ${componentSpec}
      Integration spec: ${integrationSpec}
      Artifacts: ${artifacts}

      Verify:
      - Correspondence matrix maps all properties
      - Completeness manifest covers all acceptance criteria
      - Test requirements match spec
      - Architecture baseline is measurable

      Output: PASS or FAIL with specific issues`,
      description: `Audit artifacts for ${component}`
    });

    const auditResult = await auditAgent.result();

    if (auditResult.startsWith('PASS')) {
      auditPassed = true;
    } else {
      console.log(`Audit failed (iteration ${iteration}): ${auditResult}`);
      iteration++;
    }
  }

  if (!auditPassed) {
    throw new Error(`Artifact audit failed after ${iteration} iterations`);
  }

  await lockArtifacts(component);
}
```

### Step 4: Implement Code Generation + Validation Loop (4 hours)

```typescript
// agents/codegen.ts
async function generateAndValidateCode(
  componentSpec: string,
  artifacts: ArtifactSet,
  integrationSpec: string,
  language: string,
  outputPath: string
): Promise<void> {
  // One-shot code generation (fresh agent)
  const codeAgent = await Task.launch({
    subagent_type: getLanguageAgent(language),
    prompt: `Generate implementation for component.

    Component spec: ${componentSpec}
    Integration spec: ${integrationSpec}
    Artifacts: ${JSON.stringify(artifacts)}
    Language: ${language}

    Generate production-ready code matching the spec.
    Include all functions with signatures from spec.
    Add contract annotations (@pre, @post, @error).`,
    description: `Generate code for ${component}`
  });

  const code = await codeAgent.result();
  await saveCode(outputPath, code);

  // Run 12-layer validation (NO agent, automated)
  let validationResult = await runValidation(outputPath, language);

  if (validationResult.passed) {
    console.log('✅ Validation passed on first attempt!');
    return;
  }

  // Fix loop (fresh agent each iteration)
  let iteration = 1;
  while (!validationResult.passed && iteration <= 50) {
    const fixAgent = await Task.launch({
      subagent_type: getLanguageAgent(language),
      prompt: `Fix validation failure (iteration ${iteration}).

      Component spec: ${componentSpec} 🔒 IMMUTABLE
      Artifacts: ${JSON.stringify(artifacts)} 🔒 IMMUTABLE
      Current code: ${await readCode(outputPath)}
      Validation errors: ${validationResult.errors}

      Fix the code to pass validation.
      DO NOT modify spec or artifacts.`,
      description: `Fix code iteration ${iteration}`
    });

    const fixedCode = await fixAgent.result();
    await saveCode(outputPath, fixedCode);

    validationResult = await runValidation(outputPath, language);
    iteration++;
  }

  if (!validationResult.passed) {
    throw new Error(`Validation failed after ${iteration} iterations`);
  }

  console.log(`✅ Validation passed at iteration ${iteration}`);
}
```

### Step 5: Wire Everything Together (orchestrate.ts)

```typescript
// orchestrate.ts
export async function orchestratespec2(requirements: string) {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     spec2: Building with Outline-Strong Validation  ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  // PHASE 1: SPECS
  console.log('\n🔷 PHASE 1: Specification Generation\n');

  // Tier 1
  const systemSpec = await generateSystemSpec(requirements);
  await saveAndLock('system-spec.md', systemSpec);
  const subsystems = extractSubsystems(systemSpec);

  // Tier 2 (PARALLEL)
  const subsystemSpecs = await generateSubsystemSpecs(systemSpec, subsystems);
  for (const [name, spec] of subsystemSpecs) {
    await saveAndLock(`subsystem-${name}.md`, spec);
  }

  // Tier 3 (SEQUENTIAL - user approves each)
  const components = extractComponents(subsystemSpecs);
  const componentSpecs = await generateComponentSpecs(subsystemSpecs, components);
  for (const [name, spec] of componentSpecs) {
    await saveAndLock(`comp-${name}.md`, spec);
  }

  // Tier 4
  const integrationSpec = await generateIntegrationSpec(componentSpecs);
  await saveAndLock('integration.md', integrationSpec);

  // PHASE 2: ARTIFACTS
  console.log('\n🔷 PHASE 2: Artifact Generation\n');

  for (const [component, spec] of componentSpecs) {
    await generateAndAuditArtifacts(spec, integrationSpec, component);
  }

  // PHASE 3: CODE
  console.log('\n🔷 PHASE 3: Code Generation & Validation\n');

  for (const [component, spec] of componentSpecs) {
    const language = await askLanguage(component);
    const outputPath = await askOutputPath(component, language);
    const artifacts = await loadArtifacts(component);

    await generateAndValidateCode(
      spec,
      artifacts,
      integrationSpec,
      language,
      outputPath
    );
  }

  // PHASE 4: INTEGRATION
  console.log('\n🔷 PHASE 4: Integration Test\n');

  const integrationCmd = await askIntegrationCommand();
  const testPassed = await runIntegrationTest(integrationCmd);

  if (!testPassed) {
    throw new Error('Integration tests failed');
  }

  console.log('\n✅ BUILD COMPLETE - All components validated!');

  return {
    components: Array.from(componentSpecs.keys()),
    validationStatus: 'PASSED',
    outputPath: '.spec2/specs'
  };
}
```

### Step 6: Update SKILL.md (30 min)

```markdown
---
executable: true
entry_point: skill.ts
export: execute
arguments:
  - name: requirements
    type: string
    description: "Requirements description or path to requirements.md"
---

# /spec2:new — Build New Component with Full Validation
...
```

---

## Effort Breakdown

| Task | Time | Deliverable |
|------|------|-------------|
| Executable skill structure | 4h | TypeScript project setup |
| Task-based agent launching | 8h | Tier 1-4 agent wrappers |
| Artifact generation loop | 4h | Gen + audit with fresh contexts |
| Code gen + validation loop | 4h | One-shot + fix iteration |
| Integration + testing | 2h | End-to-end workflow |
| **Total** | **22h** | **Fully automated /spec2:new** |

Slightly over initial 20h estimate due to comprehensive error handling.

---

## User's Last Request

"save your last output to a file. let's clear context then restart from the file. its going to compact context."

**Action**: Save this file, user will restart from here after context compaction.

---

## Next Steps After Context Restart

1. User says "proceed" or similar
2. Start Phase A implementation
3. Begin with Step 1: Create executable skill structure
4. Work through Steps 2-6 sequentially
5. Test with simple example: `/spec2:new "Build user authentication service"`
6. Report results

---

**Session saved**: April 11, 2026, 22:16 UTC
**Context tokens**: ~142K / 200K (71% full, compaction needed)
**Status**: Ready to implement Phase A
