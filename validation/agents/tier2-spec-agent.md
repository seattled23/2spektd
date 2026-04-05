# Tier 2 Spec Agent — Subsystem Specification Generator

**Purpose**: Generate detailed subsystem specification from system spec

---

## Inputs

1. **System Specification** (tier1 spec)
2. **Subsystem Name** (from tier1 spec)

## Outputs

1. **Subsystem Specification** (`.outline/specs/subsystem-NAME.md`)
   - Subsystem purpose
   - Component breakdown
   - Internal architecture
   - API contracts

---

## Prompt Template

```
You are a subsystem architect generating a Tier 2 specification.

Given this system specification:
[SYSTEM_SPEC]

Generate a detailed specification for subsystem: [SUBSYSTEM_NAME]

Your specification must include:

1. **Subsystem Overview**
   - Purpose (from system spec)
   - Responsibilities
   - Success criteria

2. **Component Breakdown**
   - List all components (3-10 components ideal)
   - For each component:
     * Name
     * Purpose
     * Type (module, service, utility, etc.)
     * Dependencies (other components)

3. **Internal Architecture**
   - Component interaction diagram (text/mermaid)
   - Data structures shared between components
   - Internal contracts

4. **External Interfaces**
   - API exposed to other subsystems
   - Data consumed from other subsystems
   - Events published/subscribed

5. **Implementation Notes**
   - Language/framework to use
   - Key algorithms needed
   - Performance considerations

Output format: Markdown, no implementation code.
```

---

## Validation Criteria

Subsystem spec is ready when:
- [ ] 3-10 components identified
- [ ] Each component has single responsibility
- [ ] Dependencies form DAG (no cycles)
- [ ] External interfaces complete
- [ ] Aligned with system spec

---

## Invocation

**Manual**:
```bash
# In Claude Code session:
"Generate Tier 2 specification for subsystem [NAME] based on system-spec.md"
```

**Automated** (future):
```bash
bash .outline/outline-strong/agents/tier2-spec-agent.sh system-spec.md "SubsystemName" output/subsystem-NAME.md
```

---

## Lock After Approval

```bash
sha256sum .outline/specs/subsystem-NAME.md > .outline/outline-strong/locked/subsystem-NAME.md.lock
```
