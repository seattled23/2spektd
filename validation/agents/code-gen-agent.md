# Code Generation Agent — One-Shot Implementation Generator

**Purpose**: Generate implementation code from spec + artifacts

**CRITICAL**: This agent gets ONE attempt. No iteration, no refinement.

---

## Inputs

1. **Component Specification** (tier3 spec, locked)
2. **Integration Specification** (locked)
3. **Validation Artifacts** (locked)
   - Correspondence matrix
   - Completeness manifest
   - Test requirements
   - Architecture baseline

## Outputs

1. **Implementation Code** (component source files)
2. **Test Code** (test files)

---

## Prompt Template

```
You are a code generator. You get ONE attempt to implement this component correctly.

Component specification:
[COMP_SPEC]

Integration specification:
[INTEGRATION_SPEC]

Validation artifacts:
- Correspondence: [CORRESPONDENCE_JSON]
- Completeness: [COMPLETENESS_JSON]
- Test requirements: [TEST_SPEC]
- Architecture baseline: [BASELINE_JSON]

Generate implementation that:

1. **Implements ALL functions from spec**
   - Exact signatures as specified
   - Contract annotations (@pre/@post/@error)
   - All acceptance criteria satisfied

2. **Meets architecture baseline**
   - Coupling ≤ expected
   - Complexity ≤ 10 per function
   - Cohesion as specified

3. **Includes complete tests**
   - All tests from test requirements
   - Coverage ≥80%
   - No hollow tests (all have assertions)

4. **Follows integration spec**
   - Shared types exactly as defined
   - Cross-component contracts honored

5. **Passes all 12 validation layers**
   - Contract annotations (L1)
   - Test suite (L2)
   - No hollow patterns (L3)
   - Security clean (L4)
   - Architecture scores (L5)
   - Correspondence satisfied (L7)
   - Completeness satisfied (L8)

Language: [GO|TYPESCRIPT|PYTHON|SHELL]

Output:
1. Source file(s)
2. Test file(s)
3. Brief implementation notes

ONE SHOT: This code will be validated immediately. No second chance.
```

---

## Validation Criteria

Code is ready when:
- [ ] All functions implemented
- [ ] All tests written
- [ ] Contracts annotated
- [ ] No TODOs or placeholders
- [ ] Compiles/runs without modification

---

## Invocation

**Manual**:
```bash
# In NEW Claude Code session:
"Generate implementation for component [NAME] from locked specs and artifacts"
```

**Automated** (future):
```bash
bash .spec2/outline-strong/agents/code-gen-agent.sh comp-NAME.md integration.md artifacts/ output/
```

---

## After Generation

1. Run full validation: `validate-component.sh`
2. If PASS: Done, move to next component
3. If FAIL: Send to `code-fix-agent` (max 10 iterations)
