# Shell Validation Module — Outline-Strong v2.0

**Purpose**: 8-layer deterministic validation for Shell scripts (adapted from 12-layer system)

---

## Tools Required

| Tool | Purpose | Install |
|------|---------|---------|
| `shellcheck` | Linting | `apt install shellcheck` or `brew install shellcheck` |
| `shfmt` | Formatting | `go install mvdan.cc/sh/v3/cmd/shfmt@latest` |
| `bats` | Testing | `bun install -g bats` |

**Quick Install**: `bash install-tools.sh`

---

## 8 Validation Layers (Adapted)

| Layer | Script | Purpose | Exit Code |
|-------|--------|---------|-----------|
| **-1** | `layer-n1.sh` | Syntax check (bash -n) | 11 |
| **0** | `layer-0.sh` | Linting (shellcheck) | 10 |
| **2** | `layer-2.sh` | Test suite (bats) | 22 |
| **3** | `layer-3.sh` | Anti-hollow patterns | 23 |
| **4** | `layer-4.sh` | Security patterns | 24 |
| **5** | `layer-5.sh` | Architecture scores | 25 |
| **7** | `layer-7.sh` | Correspondence matrix | 27 |
| **9** | `layer-9.sh` | Artifact chain | 29 |

**Note**: Shell scripts don't support:
- Layer 1 (Contracts) — No formal contract system in shell
- Layer 6 (Convergence) — Architecture scores too volatile for shell
- Layer 8 (Completeness) — Acceptance criteria handled via tests
- Layer 10 (Determinism) — Shell scripts often have environmental dependencies

---

## Best Practices (Layer Guidelines)

### Layer -1: Syntax Check
- All scripts must pass `bash -n` (no syntax errors)
- All scripts must have `#!/bin/bash` shebang
- All scripts must use `set -e` (exit on error)

### Layer 0: Shellcheck
- No warnings/errors from `shellcheck`
- Use SC2086 suppression only when intentional word splitting

### Layer 2: Bats Tests
- Test files: `*.bats` or `test_*.sh`
- All critical functions must have tests
- Tests must verify both success and failure cases

### Layer 3: Anti-Hollow
Detects:
1. Empty functions
2. Tests without assertions
3. Unhandled error codes

### Layer 4: Security
Patterns checked:
- Unquoted variables ($var → "$var")
- eval usage
- curl/wget without error handling
- Temporary files without cleanup

### Layer 5: Architecture
Simplified metrics:
- Function count per file
- Global variables
- Sourced dependencies

---

## Usage

**Validate component**:
```bash
cd /home/swarm/TESSARA
bash .outline/outline-strong/validate-component.sh scripts/deploy shell
```

**Run single layer**:
```bash
bash .outline/outline-strong/modules/shell/layer-0.sh scripts/deploy
```

---

**Version**: 1.0.0 (Phase 4)
**Last Updated**: 2026-04-05
