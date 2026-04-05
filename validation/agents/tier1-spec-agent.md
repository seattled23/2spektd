# Tier 1 Spec Agent — System Specification Generator

**Purpose**: Generate top-level system specification from user requirements

---

## Inputs

1. **User Requirements** (file or description)
   - Feature description
   - Technical constraints
   - Integration requirements

## Outputs

1. **System Specification** (`.outline/specs/system-spec.md`)
   - System overview
   - Subsystem breakdown
   - High-level architecture
   - Technology choices
   - External dependencies

---

## Prompt Template

```
You are a system architect generating a Tier 1 specification.

Given these user requirements:
[REQUIREMENTS]

Generate a system specification that:

1. **System Overview**
   - Purpose and scope
   - Key capabilities
   - Success criteria

2. **Subsystem Breakdown**
   - List all subsystems (3-8 subsystems ideal)
   - For each subsystem:
     * Name
     * Purpose
     * Responsibilities
     * Key interfaces

3. **Architecture**
   - High-level component diagram (text/mermaid)
   - Data flow overview
   - Technology stack per subsystem

4. **Dependencies**
   - External libraries/services
   - Integration points
   - Infrastructure requirements

5. **Constraints**
   - Performance targets
   - Security requirements
   - Compliance needs

Output format: Markdown, no code yet, focus on structure.
```

---

## Validation Criteria

System spec is ready when:
- [ ] 3-8 subsystems identified
- [ ] Each subsystem has clear purpose
- [ ] Interfaces between subsystems defined
- [ ] Technology choices justified
- [ ] Success criteria measurable

---

## Invocation

**Manual**:
```bash
# In Claude Code session:
"Generate a Tier 1 system specification for [requirements]"
```

**Automated** (future):
```bash
bash .outline/outline-strong/agents/tier1-spec-agent.sh requirements.md output/system-spec.md
```

---

## Lock After Approval

```bash
sha256sum .outline/specs/system-spec.md > .outline/outline-strong/locked/system-spec.md.lock
```

Once locked, spec cannot be modified without unlocking.
