# /2spektd:new — Build New Component with Full Validation

**Purpose**: Build a new component from scratch using the complete spec → artifact → code → validate workflow with anti-reward-hacking guarantees.

---

## Usage

```bash
/2spektd:new "<requirements-description>"
```

**Examples**:
```bash
/2spektd:new "Build analytics dashboard with real-time WebSocket updates"
/2spektd:new "Create user authentication service with JWT tokens"
/2spektd:new "Implement CSV export functionality for reports"
```

---

## Workflow

This skill executes the complete 2spektd build pipeline:

### Phase 1: Specification Generation

1. **Tier 1 (System Spec)** — Analyze requirements, identify subsystems
   - Generates: `.2spektd/specs/system-spec.md`
   - User approval required

2. **Tier 2 (Subsystem Specs)** — Break down each subsystem into components
   - Generates: `.2spektd/specs/subsystem-{NAME}.md` for each
   - User approval per subsystem

3. **Tier 3 (Component Specs)** — Detail each component down to functions
   - Generates: `.2spektd/specs/comp-{NAME}.md` for each
   - Includes: Function signatures, acceptance criteria, test requirements
   - User approval per component

4. **Integration Spec** — Define cross-component consistency
   - Generates: `.2spektd/specs/integration.md`
   - Includes: Shared types, cross-component contracts, data flow
   - User approval required

5. **Lock all specs** — Specs become immutable after approval

### Phase 2: Artifact Generation

For each component:

1. **Generate Validation Artifacts**
   - Correspondence matrix (property → ≥3 layers)
   - Completeness manifest (all acceptance criteria)
   - Test requirements
   - Architecture baseline

2. **Independent Audit** (fresh context)
   - Verify artifacts match spec
   - Ensure comprehensive coverage
   - Loop until audit passes

3. **Lock artifacts** — Artifacts become immutable

### Phase 3: Implementation

For each component:

1. **One-Shot Code Generation** (fresh context)
   - Generate implementation from spec + artifacts
   - Single attempt, no iteration

2. **Run 12-Layer Validation**
   - If PASS: Move to next component
   - If FAIL: Enter fix loop

3. **Unlimited Fix Iteration** (if needed)
   - Each fix attempt in fresh context
   - Loops until validation passes
   - User can interrupt (Ctrl+C) if stuck

### Phase 4: Integration Test

- Run end-to-end integration tests
- Verify all components work together

---

## What You'll Be Asked

### During Spec Generation:
- Review and approve system spec
- List subsystems to implement
- Review and approve each subsystem spec
- List components per subsystem
- Review and approve each component spec
- Review and approve integration spec

### During Artifact Generation:
- Artifacts are generated and audited automatically
- You'll only be notified when audit passes

### During Implementation:
- Language for each component (go/typescript/python/shell)
- Path where to save generated code
- Whether to continue fixing if validation fails
- (Optional) Manual intervention if many iterations fail

---

## Anti-Reward-Hacking Features

1. **Context Isolation** — Each workflow step gets fresh agent context
2. **Immutable Artifacts** — Specs/tests can't be adjusted to match bad code
3. **One-Shot Code Gen** — No iterative "learning" of validation patterns
4. **Independent Audit** — Auditor never sees generator's reasoning
5. **Fresh Fix Context** — Each fix attempt prevents pattern gaming

---

## Output Structure

```
.2spektd/
├── specs/
│   ├── system-spec.md          [LOCKED]
│   ├── subsystem-*.md          [LOCKED]
│   ├── comp-*.md               [LOCKED]
│   └── integration.md          [LOCKED]
├── artifacts/
│   └── {component}/
│       ├── correspondence.json  [LOCKED]
│       ├── completeness.json    [LOCKED]
│       ├── test-requirements.md [LOCKED]
│       └── architecture.json    [LOCKED]
└── locked/
    ├── system-spec.md.lock
    ├── subsystem-*.md.lock
    ├── comp-*.md.lock
    ├── integration.md.lock
    └── *-artifacts.tar.gz.lock
```

Generated code goes in your normal project structure (e.g., `pkg/`, `src/`, `lib/`).

---

## Exit Conditions

**Success**: All components validated and integration tests pass
**User Rejection**: User rejects a spec during approval
**User Interrupt**: User presses Ctrl+C during fix loop
**Integration Failure**: Integration tests fail after all components validated

---

## Time Estimates

Based on component complexity:

| Component Size | Spec Time | Artifact Time | Code+Validate Time | Total |
|----------------|-----------|---------------|-------------------|-------|
| Small (1-3 functions) | 10-15 min | 5-10 min | 15-30 min | 30-55 min |
| Medium (5-10 functions) | 20-30 min | 10-15 min | 30-60 min | 60-105 min |
| Large (10+ functions) | 30-45 min | 15-20 min | 60-120 min | 105-185 min |

**System with 3-5 components**: 2-6 hours end-to-end

---

## Tips for Success

1. **Clear Requirements** — More detail = better specs
2. **Approve Specs Carefully** — Locked after approval
3. **Review Acceptance Criteria** — These drive validation
4. **Let Fix Loop Run** — Each iteration improves code
5. **Interrupt if Stuck** — If >50 iterations, something's wrong with spec

---

## References

- **Full Specification**: `validation/OUTLINE-STRONG-V2-SPEC.md`
- **Quick Start**: `validation/QUICK-START.md`
- **Agent Workflows**: `validation/agents/README.md`
