# Artifact Generation Agent — Validation Artifact Creator

**Purpose**: Generate validation artifacts from component + integration specs

---

## Inputs

1. **Component Specification** (tier3 spec)
2. **Integration Specification** (cross-file consistency)

## Outputs

1. **Correspondence Matrix** (`correspondence-COMP.json`)
   - Maps each acceptance criterion to ≥3 validation layers

2. **Completeness Manifest** (`completeness-COMP.json`)
   - Lists all acceptance criteria with implementation status

3. **Baseline Tests** (test files for component)
   - Test structure (file names, test names)
   - Test requirements (what each test validates)
   - NO implementation code yet

4. **Architecture Baseline** (`architecture-baseline.json`)
   - Expected coupling, cohesion, complexity scores

---

## Prompt Template

```
You are a validation artifact generator.

Given this component specification:
[COMP_SPEC]

And this integration specification:
[INTEGRATION_SPEC]

Generate validation artifacts to ensure implementation correctness.

Your artifacts:

1. **Correspondence Matrix** (JSON)
{
  "AC-001: FunctionX handles null input": [
    "Layer 1: Contract @pre annotation",
    "Layer 2: Unit test test_function_x_null",
    "Layer 3: Hollow pattern check for silent null handling"
  ],
  "AC-002: FunctionX returns valid JSON": [
    "Layer 2: Unit test test_function_x_output_valid",
    "Layer 5: Architecture check for error wrapping",
    "Layer 7: Integration test validates JSON schema"
  ],
  ...
}

RULE: Every acceptance criterion must map to ≥3 layers.

2. **Completeness Manifest** (JSON)
{
  "criteria": [
    {
      "id": "AC-001",
      "description": "FunctionX handles null input",
      "status": "pending"
    },
    ...
  ]
}

3. **Baseline Tests** (Markdown spec, NOT code)
Files needed:
- component_test.go (or .ts, .py depending on language)
- integration_test.go

Test requirements:
- test_function_x_null: Verify FunctionX(null) returns error
- test_function_x_valid_input: Verify FunctionX(valid) succeeds
- test_function_x_edge_case: Verify FunctionX(boundary) correct
...

Coverage target: ≥80%

4. **Architecture Baseline** (JSON)
{
  "expected_coupling": 5,
  "expected_cohesion": 8,
  "max_complexity": 10,
  "min_coverage": 80
}

Output: 4 separate files in .outline/outline-strong/comp-NAME/artifacts/
```

---

## Validation Criteria

Artifacts are ready when:
- [ ] Every AC mapped to ≥3 layers
- [ ] All ACs in completeness manifest
- [ ] Test requirements comprehensive
- [ ] Architecture baseline realistic
- [ ] Ready for independent audit

---

## Invocation

**Manual**:
```bash
# In Claude Code session:
"Generate validation artifacts for component [NAME] from comp-NAME.md and integration.md"
```

**Automated** (future):
```bash
bash .outline/outline-strong/agents/artifact-gen-agent.sh comp-NAME.md integration.md output/artifacts/
```

---

## Send to Audit

Artifacts must be audited by `artifact-audit-agent` before locking.
