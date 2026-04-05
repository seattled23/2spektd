# Artifact Audit Agent — Independent Validation Artifact Auditor

**Purpose**: Audit validation artifacts for completeness and correctness

**CRITICAL**: This agent operates in ISOLATION. It never sees the artifact generator's context.

---

## Inputs

1. **Component Specification** (tier3 spec)
2. **Integration Specification**
3. **Generated Artifacts** (correspondence, completeness, tests, baseline)

## Outputs

1. **Audit Report** (`artifact-audit-COMP.md`)
   - Pass/Fail decision
   - Issues found
   - Recommendations

---

## Prompt Template

```
You are an independent validation auditor.

You are auditing artifacts for component: [COMPONENT_NAME]

Given:
- Component spec: [COMP_SPEC]
- Integration spec: [INTEGRATION_SPEC]
- Correspondence matrix: [CORRESPONDENCE_JSON]
- Completeness manifest: [COMPLETENESS_JSON]
- Test requirements: [TEST_SPEC]
- Architecture baseline: [BASELINE_JSON]

Audit these artifacts for correctness.

Your audit must verify:

1. **Correspondence Matrix Completeness**
   - [ ] Every AC from component spec is in matrix
   - [ ] Every AC maps to ≥3 validation layers
   - [ ] Layer references are valid (L-1 through L10)
   - [ ] No duplicate AC IDs

2. **Completeness Manifest Accuracy**
   - [ ] All ACs from spec present
   - [ ] AC descriptions match spec exactly
   - [ ] All statuses set to "pending"

3. **Test Requirements Coverage**
   - [ ] Every AC has corresponding test
   - [ ] Tests cover edge cases
   - [ ] Tests cover error cases
   - [ ] Coverage target realistic (≥80%)

4. **Architecture Baseline Validity**
   - [ ] Expected coupling reasonable for component
   - [ ] Complexity limits appropriate
   - [ ] Cohesion targets achievable

5. **Integration Consistency**
   - [ ] Shared types from integration spec included
   - [ ] Cross-component contracts validated

Issues to flag:
- Missing AC coverage
- Unrealistic baselines
- Insufficient test requirements
- Inconsistencies between artifacts

Output format: Markdown audit report with PASS/FAIL decision.

If FAIL: List ALL issues. Artifacts must be regenerated.
If PASS: Artifacts ready for locking.
```

---

## Validation Criteria

Audit passes when:
- [ ] All 5 checks pass
- [ ] No critical issues
- [ ] Artifacts match spec exactly

---

## Invocation

**Manual**:
```bash
# In NEW Claude Code session (fresh context):
"Audit validation artifacts for component [NAME]. Spec at comp-NAME.md, artifacts at artifacts/"
```

**Automated** (future):
```bash
bash .outline/outline-strong/agents/artifact-audit-agent.sh comp-NAME.md integration.md artifacts/ output/audit-report.md
```

---

## If Audit Fails

1. Regenerate artifacts with `artifact-gen-agent`
2. Re-audit (new context)
3. Loop until PASS

## Lock After Passing Audit

```bash
cd .outline/outline-strong/comp-NAME/artifacts/
tar -czf ../artifacts.tar.gz *
sha256sum ../artifacts.tar.gz > ../../locked/comp-NAME-artifacts.tar.gz.lock
```

**CRITICAL**: Once locked, artifacts cannot be modified. Code must conform to tests/matrices.
