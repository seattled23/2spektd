# Integration Spec Agent — Cross-File Consistency Map Generator

**Purpose**: Generate specification for cross-component consistency

---

## Inputs

1. **All Tier 3 Component Specs** (every comp-*.md)

## Outputs

1. **Integration Specification** (`.spec2/specs/integration.md`)
   - Shared types/interfaces
   - Cross-component contracts
   - Data flow between components
   - Consistency requirements

---

## Prompt Template

```
You are an integration architect generating cross-component consistency requirements.

Given these component specifications:
[ALL_TIER3_SPECS]

Generate an integration specification that ensures components work together.

Your specification must include:

1. **Shared Types**
   - List every type/interface used by >1 component
   - For each:
     * Name
     * Definition (fields, methods)
     * Used by: [component list]
     * Must remain identical across files

2. **Cross-Component Contracts**
   - For each component interaction:
     * Component A calls Component B
     * Function: B.FunctionName
     * Contract: Input X must satisfy [condition]
     * Contract: Output Y will satisfy [condition]

3. **Data Flow**
   - System-wide data transformations
   - Serialization formats (JSON, binary, etc.)
   - Validation requirements at boundaries

4. **Global Constants**
   - Configuration values shared across components
   - Error codes/messages
   - Version numbers

5. **Consistency Checks**
   - Type compatibility matrix
   - Import dependency graph (must be DAG)
   - Naming conventions enforcement

6. **Integration Test Requirements**
   - End-to-end test scenarios
   - Component interaction tests
   - Data flow validation tests

Output format: Markdown. Focus on what must stay consistent.
```

---

## Validation Criteria

Integration spec is ready when:
- [ ] All shared types documented
- [ ] All cross-component calls mapped
- [ ] No circular dependencies
- [ ] Integration tests defined
- [ ] Consistency checks automatable

---

## Invocation

**Manual**:
```bash
# In Claude Code session:
"Generate integration specification from all tier3 specs in .spec2/specs/"
```

**Automated** (future):
```bash
bash .spec2/outline-strong/agents/integration-spec-agent.sh .spec2/specs/comp-*.md output/integration.md
```

---

## Lock After Approval

```bash
sha256sum .spec2/specs/integration.md > .spec2/outline-strong/locked/integration.md.lock
```

**CRITICAL**: This spec prevents integration bugs. Must be generated BEFORE any code.
