# Agent Orchestration System — Outline-Strong v2.0

**Purpose**: Isolated agent workflow for spec → artifact → code → validate cycle

---

## Architecture

```
Workflow: Tier1 Spec → Tier2 Specs → Tier3 Specs → Integration Spec
          ↓
          Artifacts (for each component)
          ↓
          Code Generation (one-shot per component)
          ↓
          Validation → Fix Loop (one-shot fixes, max 10 iterations)
```

**Key Design Principles:**
1. **Context Isolation**: Each agent gets fresh context window
2. **Immutable Artifacts**: Specs and validation artifacts locked after approval
3. **One-Shot Enforcement**: Each agent gets 1 attempt at generation
4. **Independent Auditing**: Artifact auditor separate from generator
5. **Fix Iteration**: Max 10 fix attempts per component before escalation

---

## 8 Agent Scripts

| Script | Purpose | Input | Output |
|--------|---------|-------|--------|
| `tier1-spec-agent.sh` | System spec | User requirements | System spec (subsystems) |
| `tier2-spec-agent.sh` | Subsystem spec | System spec + subsystem name | Subsystem spec (components) |
| `tier3-spec-agent.sh` | Component spec | Subsystem spec + component name | Component spec (functions) |
| `integration-spec-agent.sh` | Integration spec | All tier3 specs | Cross-file consistency map |
| `artifact-gen-agent.sh` | Validation artifacts | Component spec + integration spec | Tests, matrices, manifests |
| `artifact-audit-agent.sh` | Audit artifacts | Generated artifacts | Audit report (pass/fail) |
| `code-gen-agent.sh` | Code generation | Component spec + artifacts | Implementation code |
| `code-fix-agent.sh` | Code fixing | Code + validation errors + spec | Fixed code |

---

## Master Orchestrator

**`orchestrate-build.sh`**

Full workflow automation:
1. Generate tier1 spec (user approval required)
2. For each subsystem:
   - Generate tier2 spec (user approval)
3. For each component:
   - Generate tier3 spec (user approval)
4. Generate integration spec (user approval)
5. Lock all specs (immutable)
6. For each component:
   - Generate artifacts
   - Audit artifacts (loop until pass)
   - Lock artifacts
   - Generate code (one-shot)
   - Run validation
   - If fail: Fix loop (unlimited, each iteration in fresh context)
   - Loop continues until validation passes
7. Final integration test

---

## Usage

**Full workflow (from scratch)**:
```bash
cd /home/swarm/TESSARA
bash .outline/outline-strong/agents/orchestrate-build.sh "Build new analytics component"
```

**Individual agents**:
```bash
# Generate tier1 spec
bash .outline/outline-strong/agents/tier1-spec-agent.sh "requirements.md" "output/system-spec.md"

# Generate component spec
bash .outline/outline-strong/agents/tier3-spec-agent.sh "subsystem-spec.md" "ComponentName" "output/comp-spec.md"

# Generate code
bash .outline/outline-strong/agents/code-gen-agent.sh "comp-spec.md" "integration-spec.md" "artifacts/" "output/implementation.go"
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User rejected spec/artifact |
| 2 | Artifact audit failed |
| 3 | Code generation failed |
| 130 | User interrupted fix loop (Ctrl+C) |
| 5 | Integration test failed |

---

## Artifact Lock Mechanism

Locked files stored in `.outline/outline-strong/locked/`:
- `system-spec.md.lock` (SHA-256 hash)
- `subsystem-NAME.md.lock`
- `comp-NAME.md.lock`
- `integration.md.lock`
- `comp-NAME-artifacts.tar.gz.lock`

Agents check lock files before modification. Any attempt to modify locked file = HARD ERROR.

---

## Anti-Reward-Hacking Features

1. **Spec-first**: All specs generated before code
2. **Artifact immutability**: Tests/matrices can't be adjusted to match bad code
3. **One-shot code gen**: No iterative "learning" of validation patterns
4. **Independent audit**: Artifact auditor never sees artifact generator's context
5. **Fix isolation**: Each fix attempt in new context window
6. **Unlimited iteration**: Loops until correct (user can interrupt if stuck)

---

**Version**: 1.0.0 (Phase 5)
**Last Updated**: 2026-04-05
