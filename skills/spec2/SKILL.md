---
name: spec2-new
executable: true
entry_point: skill.ts
export: execute
arguments:
  - name: requirements
    type: string
    description: "Requirements description or path to requirements.md file"
  - name: language
    type: string
    description: "Target language (python, typescript, go, java)"
    optional: true
---

# /spec2-new — Build New Component with Full Validation

Generates production-ready code from requirements using a 4-tier progressive narrowing approach with wave-based validation.

## Features (v1.2.0)

- **6-wave pipeline** — System → Subsystem → Component → Integration → Artifacts → Code
- **Agent isolation** — every LLM call receives only its scoped slice; no agent sees sibling specs
- **Integration Registry** — SQLite-backed component metadata (~10x Tier 4 context reduction)
- **Anti-hallucination** — AST-based detection for generated code
- **Anti-hollow tests** — AST-based detection of zero/tautological assertions (TS/JS); regex heuristics for Python
- **Resume** — `/spec2-resume` picks up from the last checkpoint after an interruption

## Usage

```bash
/spec2-new "Build user authentication service with JWT tokens, session management, and password reset"
```

See `ROADMAP.md` in the repo root for shipped features, deferred work, and known issues.
