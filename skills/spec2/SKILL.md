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
    description: "Target language (python, typescript, go, java, rust)"
    optional: true
---

# /spec2-new — Build New Component with Full Validation

Generates production-ready code from requirements using a 4-tier progressive narrowing approach with wave-based validation.

## Features

- **4-Tier Spec Generation**: System → Subsystem → Component → Integration
- **Integration Registry**: SQLite-based metadata tracking (12x context reduction for Tier 4)
- **Visual Review Packages**: 1-page summaries + Mermaid diagrams (5-10x faster review)
- **Anti-Hallucination**: AST-based detection (100% precision, 96% reduction)
- **Anti-Hollow Tests**: Assertion density + mutation testing (>80% mutation scores)
- **Confidence Scoring**: Deterministic 0-100 scores, smart routing
- **12-Layer Validation**: Full Outline-Strong validation stack

## Usage

```bash
/spec2-new "Build user authentication service with JWT tokens, session management, and password reset"
```

## See Also

- Design docs in ~/spec2/
