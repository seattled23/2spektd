# Tier 3 Spec Agent — Component Specification Generator

**Purpose**: Generate implementation-ready component specification

---

## Inputs

1. **Subsystem Specification** (tier2 spec)
2. **Component Name** (from tier2 spec)

## Outputs

1. **Component Specification** (`.outline/specs/comp-NAME.md`)
   - Function signatures
   - Acceptance criteria
   - Test requirements
   - CRITICAL: This is the source of truth for validation

---

## Prompt Template

```
You are a component architect generating a Tier 3 specification.

Given this subsystem specification:
[SUBSYSTEM_SPEC]

Generate an implementation-ready specification for component: [COMPONENT_NAME]

Your specification must include:

1. **Component Overview**
   - Purpose (from subsystem spec)
   - Dependencies (other components)
   - Language/framework

2. **Public API**
   For each public function/method:
   - Signature (name, parameters, return type)
   - Purpose (what it does)
   - Preconditions (@pre)
   - Postconditions (@post)
   - Error cases (@error or @raises or @throws)
   - Complexity target (O notation)

3. **Internal Functions**
   - List private/internal functions needed
   - Brief purpose for each

4. **Data Structures**
   - Types/classes needed
   - Fields and invariants
   - Relationships

5. **Acceptance Criteria**
   For each public function:
   - AC-001: [Function name] correctly handles [case]
   - AC-002: [Function name] rejects invalid [input]
   - ... (all edge cases)

6. **Test Requirements**
   - Unit tests: [list test files needed]
   - Integration tests: [if applicable]
   - Minimum coverage: 80%

7. **Architecture Scores Expected**
   - Coupling: ≤ X imports
   - Complexity: ≤ 10 cyclomatic per function
   - Cohesion: Single responsibility

Output format: Markdown. Be exhaustive. Every detail needed for implementation.
```

---

## Validation Criteria

Component spec is ready when:
- [ ] All public functions fully specified
- [ ] All acceptance criteria listed
- [ ] Test requirements defined
- [ ] No ambiguity in requirements
- [ ] Reviewable by non-implementer

---

## Invocation

**Manual**:
```bash
# In Claude Code session:
"Generate Tier 3 specification for component [NAME] from subsystem-NAME.md"
```

**Automated** (future):
```bash
bash .outline/outline-strong/agents/tier3-spec-agent.sh subsystem-NAME.md "ComponentName" output/comp-NAME.md
```

---

## Lock After Approval

```bash
sha256sum .outline/specs/comp-NAME.md > .outline/outline-strong/locked/comp-NAME.md.lock
```

**CRITICAL**: Once locked, this spec cannot be modified. All validation artifacts and code must conform to THIS spec.
