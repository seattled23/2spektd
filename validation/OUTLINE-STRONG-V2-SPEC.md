# Outline-Strong v2.0 — Multi-Language, Isolation-Based Validation System

**Version**: 2.0.0
**Date**: 2026-04-05
**Status**: Design Specification
**Purpose**: Enhance TESSARA's existing 10-layer Outline-Strong validation system with language-specific modules and isolation-based workflow to eliminate reward hacking

---

## Executive Summary

Outline-Strong v2.0 extends the existing HARD/SOFT gate validation system with:

1. **Language-Specific Modules** — Validation tools for Go, TypeScript, Python, Shell
2. **Isolation-Based Workflow** — Agent context separation at spec/artifact/code/fix boundaries
3. **3-Tier Specification** — System → Subsystem → Component → Integration specs
4. **Deterministic Gates** — No probabilistic AI-based validation; only go/no-go tests
5. **Anti-Reward-Hacking** — Correct code becomes the easiest path to completion

---

## Design Principles

### 1. **Deterministic Validation Only**

❌ **Banned**:
- Model-based soft validation
- Probabilistic scoring without hard gates
- "Graceful degradation" that allows bypasses
- Any validation that can be gamed

✅ **Required**:
- Binary go/no-go tests (exit 0 = pass, non-zero = fail)
- Reproducible results (same input → same output)
- No human judgment in automated gates
- Violations block progress (no silent failures)

### 2. **Agent Isolation Barriers**

Each workflow step runs in **fresh, isolated context**:

| Step | Agent | Input | Output | Context Reset |
|------|-------|-------|--------|---------------|
| Tier 1 Spec | A1 | Requirements | System spec (subsystems) | ✓ |
| Tier 2 Specs | A2 | System spec + subsystem | Component specs (per subsystem) | ✓ |
| Tier 3 Specs | A3 | Component spec | Function specs (per component) | ✓ |
| Integration Spec | A4 | All specs | Cross-file consistency map | ✓ |
| Validation Artifacts | A5 | Component spec + integration spec | Layer artifacts (tests, contracts, etc.) | ✓ |
| Artifact Audit | A6 | Validation artifacts | Audit report (pass/fail) | ✓ |
| Code Generation | A7 | Component spec + integration spec + artifacts | Source code (one shot) | ✓ |
| Validation Run | System | Code + artifacts | Pass/fail report | N/A |
| Code Fix (if fail) | A8 | Code + errors + spec + artifacts | Fixed code (one shot) | ✓ |

**No shared context** except explicit inputs/outputs.

### 3. **Immutability Enforcement**

Once approved, artifacts **cannot be altered**:

- Tier 1/2/3 specs: Locked after approval
- Integration spec: Locked after approval
- Validation artifacts: Locked after audit pass
- Only code can be regenerated during fix iterations

### 4. **Language-Specific Toolchains**

Each language gets a validation module with tools for each applicable layer:

```
.outline/outline-strong/modules/
├── go/
│   ├── layer-n1.sh   # Self-validation (go build/vet/test)
│   ├── layer-0.sh    # Static analysis (go vet)
│   ├── layer-1.sh    # Contracts (custom annotations)
│   ├── layer-2.sh    # Tests (go test -race -cover)
│   ├── layer-3.sh    # Anti-hollow (pattern scanner)
│   ├── layer-4.sh    # Security (gosec + govulncheck)
│   ├── layer-5.sh    # Architecture (complexity analyzer)
│   ├── layer-6.sh    # Convergence (determinism check)
│   ├── layer-7.sh    # Correspondence (matrix validator)
│   ├── layer-8.sh    # Completeness (acceptance check)
│   ├── layer-9.sh    # Artifact chain (report generator)
│   └── layer-10.sh   # Determinism (run comparison)
├── typescript/
│   ├── layer-n1.sh   # Self-validation (tsc + eslint + vitest)
│   ├── layer-0.sh    # Static analysis (tsc --noEmit)
│   ├── layer-1.sh    # Contracts (tsdoc annotations)
│   ├── layer-2.sh    # Tests (vitest run --coverage)
│   └── ...
├── python/
│   ├── layer-n1.sh   # Self-validation (pyright + pytest)
│   ├── layer-0.sh    # Static analysis (pyright --strict)
│   ├── layer-1.sh    # Contracts (deal lint)
│   ├── layer-2.sh    # Tests (pytest --cov)
│   └── ...
└── shell/
    ├── layer-n1.sh   # Self-validation (shellcheck + shfmt)
    ├── layer-0.sh    # Static analysis (shellcheck)
    └── ...
```

---

## Layer Definitions (10 Layers + 3-Tier Specs)

### **Pre-Layers: 3-Tier Specification**

#### **Tier 1: System Specification**
**Agent**: A1 (isolated)
**Input**: User requirements, existing codebase (read-only)
**Output**: `tier1-system-spec.md`

**Contents**:
- System overview
- Subsystem decomposition (list of subsystems with boundaries)
- Subsystem responsibilities
- Inter-subsystem dependencies

**Format**:
```markdown
# System: TESSARA

## Subsystems
1. **COMP-00: SCM** — Structural Contract Model types
2. **COMP-01: FHIR** — FHIR IG parser
3. ...

## Subsystem Boundaries
- COMP-00 defines types, COMP-01 consumes them
- COMP-01 outputs SCMRoot, COMP-03 hashes it
- ...
```

#### **Tier 2: Subsystem Specifications**
**Agent**: A2 (isolated, one per subsystem)
**Input**: `tier1-system-spec.md` + subsystem name
**Output**: `tier2-<subsystem>-spec.md` (one file per subsystem)

**Contents**:
- Subsystem purpose
- Component decomposition (list of components/files)
- Component responsibilities
- Intra-subsystem dependencies

**Format**:
```markdown
# Subsystem: COMP-01 FHIR

## Components
1. **parser.go** — Parses .tgz packages → StructureDefinition map
2. **builder.go** — Builds SCMNode tree from ElementDefinition
3. **types.go** — Defines Package, ProfileMap types

## Component Dependencies
- parser.go depends on types.go (Package, ProfileMap)
- builder.go depends on types.go + internal/scm (SCMNode)
- ...
```

#### **Tier 3: Component Specifications**
**Agent**: A3 (isolated, one per component)
**Input**: `tier2-<subsystem>-spec.md` + component name
**Output**: `tier3-<component>-spec.md` (one file per component)

**Contents**:
- Component purpose
- Function signatures (all public + key private functions)
- Data structures
- Error conditions
- Acceptance criteria (concrete examples)

**Format**:
```markdown
# Component: pkg/fhir/parser.go

## Public Functions

### ParsePackage(r io.Reader) (*Package, error)
**Purpose**: Extract FHIR IG package from .tgz archive
**Inputs**: io.Reader (gzipped tar stream)
**Outputs**:
  - *Package (name, version, profiles map)
  - error (if tar corrupt, package.json missing, malformed JSON)
**Preconditions**: r contains valid .tgz
**Postconditions**: profiles keyed by canonical URL

**Acceptance Criteria**:
- TC-01: CARIN BB .tgz → 16 profiles
- TC-02: US Core .tgz → 59 profiles
- TC-03: Malformed .tgz → error
...
```

#### **Integration Specification**
**Agent**: A4 (isolated)
**Input**: All tier 1/2/3 specs
**Output**: `integration-spec.md`

**Contents**:
- Cross-file type definitions (must stay consistent)
- Shared constants/enums
- API contracts between components
- Global invariants (e.g., "SCMNode has exactly 10 fields")

**Format**:
```markdown
# Integration Spec: TESSARA

## Cross-File Types

### SCMNode (internal/scm/types.go)
**Used by**: COMP-01, COMP-03, COMP-04, COMP-05, COMP-06
**Fields (immutable)**:
1. ID string
2. Path string
3. Min int
4. Max string
5. Type string
6. Binding string
7. MustSupport bool
8. TargetProfile string
9. Children []SCMNode
10. Metadata map[string]interface{}

**Constraint**: Exactly 10 fields (patent-protected)

### ComplianceVerdict (internal/verdict/types.go)
**Used by**: COMP-07, COMP-08
**Fields**: ...
```

---

### **Layer -1: Self-Validation (HARD)**

**Purpose**: Code compiles, lints, and basic tests pass
**Gate**: BLOCKING
**When**: Before all other layers

**Language-Specific Tools**:

| Language | Tool | Command | Pass Criteria |
|----------|------|---------|---------------|
| Go | go build + vet + test | `go build ./... && go vet ./... && go test -race -count=1 ./...` | Exit 0, 0 failures |
| TypeScript | tsc + eslint + vitest | `tsc --noEmit && eslint . && vitest run` | Exit 0, 0 failures |
| Python | pyright + pytest | `pyright . && pytest tests/` | Exit 0, 0 failures |
| Shell | shellcheck + shfmt | `shellcheck *.sh && shfmt -d .` | Exit 0, no diffs |

**Violation Handling**: Fix immediately, re-run until pass

---

### **Layer 0: Static Analysis (HARD)**

**Purpose**: No type errors, unused variables, unreachable code
**Gate**: BLOCKING
**Tools**: Language-specific static analyzers

| Language | Tool | Command |
|----------|------|---------|
| Go | go vet | `go vet ./...` |
| TypeScript | tsc strict | `tsc --strict --noEmit` |
| Python | pyright strict | `pyright --strict .` |
| Shell | shellcheck | `shellcheck --severity=warning *.sh` |

**Pass Criteria**: Zero warnings/errors
**Violation**: Fix code, re-run

---

### **Layer 1: Contracts (HARD)**

**Purpose**: Preconditions, postconditions, invariants documented and enforced
**Gate**: BLOCKING
**Format**: Language-specific contract annotations

#### **Go** (custom annotations in comments)
```go
// ParsePackage extracts FHIR IG package from .tgz archive
// @pre: r is valid .tgz stream
// @post: profiles keyed by canonical URL OR error returned
// @error: tar corrupt, package.json missing, malformed JSON
func ParsePackage(r io.Reader) (*Package, error) {
    // ...
}
```

**Validation**: Grep for `@pre`, `@post`, `@error` on all public functions

#### **TypeScript** (TSDoc)
```typescript
/**
 * @pre filename ends with '.astro'
 * @post returns AST or throws error
 * @throws {ParseError} if syntax invalid
 */
export function parseAstro(filename: string): AST {
    // ...
}
```

**Validation**: `tsdoc` linter checks all exports

#### **Python** (deal)
```python
import deal

@deal.pre(lambda r: hasattr(r, 'read'))
@deal.post(lambda result: result is not None or isinstance(result, Package))
def parse_package(r: io.Reader) -> Package | None:
    # ...
```

**Validation**: `deal lint src/` (exit 0 = pass)

**Pass Criteria**: All public functions have `@pre`, `@post`, `@error`/`@throws`
**Violation**: Add missing contracts, re-run

---

### **Layer 2: Tests (HARD)**

**Purpose**: Behavioral tests with ≥80% coverage
**Gate**: BLOCKING

| Language | Tool | Command | Pass Criteria |
|----------|------|---------|---------------|
| Go | go test | `go test -race -count=1 -cover ./...` | 0 failures, ≥80% coverage, race-clean |
| TypeScript | vitest | `vitest run --coverage` | 0 failures, ≥80% coverage |
| Python | pytest | `pytest --cov=src --cov-fail-under=80` | 0 failures, ≥80% coverage |
| Shell | bats | `bats tests/*.bats` | 0 failures |

**Tests must verify ACTUAL behavior** (see Anti-Hollow layer)

**Violation**: Write missing tests, fix failures, re-run

---

### **Layer 3: Anti-Hollow (HARD)**

**Purpose**: No empty/hollow implementations that pass tests without doing work
**Gate**: BLOCKING
**Detection**: Pattern scanning for hollow patterns

**Hollow Patterns (banned)**:

1. **Empty returns without logic**
```go
func Process(data []byte) error {
    return nil  // HOLLOW — does nothing
}
```

2. **Tests that don't verify state changes**
```go
func TestProcess(t *testing.T) {
    Process(data)  // HOLLOW — no assertion
}
```

3. **Hardcoded test data matching expected output**
```python
def calculate_total(items):
    return 42  # HOLLOW — hardcoded, not calculated

def test_calculate_total():
    assert calculate_total([10, 20, 12]) == 42  # passes but hollow
```

4. **Silent error swallowing**
```typescript
try {
    doWork();
} catch (e) {
    // HOLLOW — error ignored
}
```

5. **Mock-only success** (no real implementation path tested)

**Validation Tool**: `hollow-scanner` (custom script)

**Algorithm**:
1. Find functions with single `return` statement (no logic)
2. Find tests with no assertions (`assert`, `require`, `expect`)
3. Find try/catch with empty catch
4. Find hardcoded test values that match expected outputs

**Pass Criteria**: Zero hollow patterns detected
**Known False Positives**: Document in `.hollow-allowlist` with justification
**Violation**: Rewrite hollow code, re-run

---

### **Layer 4: Security Audit (HARD)**

**Purpose**: No vulnerabilities, unsafe patterns, or dependency issues
**Gate**: BLOCKING (critical/high severity only)

| Language | Tool | Command |
|----------|------|---------|
| Go | gosec + govulncheck | `gosec ./... && govulncheck ./...` |
| TypeScript | npm audit | `npm audit --production --audit-level=high` |
| Python | bandit + safety | `bandit -r src/ && safety check` |
| Shell | shellcheck security | `shellcheck --severity=warning *.sh` |

**Pass Criteria**: Zero critical/high findings
**Medium/Low**: Document in security log, defer to next sprint
**Violation**: Fix vulnerability, re-run

---

### **Layer 5: Architecture Scores (SOFT → HARD gate at ≥80)**

**Purpose**: Maintainability metrics
**Gate**: SOFT (scoring) with HARD threshold (≥80 composite)

**Dimensions** (language-agnostic):

1. **Coupling** (0-100): Dependencies between modules
2. **Cohesion** (0-100): Single responsibility per module
3. **Complexity** (0-100): Cyclomatic/cognitive complexity
4. **Interface Compliance** (0-100): API contract adherence
5. **Error Handling** (0-100): Error propagation coverage
6. **Package Design** (0-100): Logical grouping

**Composite Score**: Average of 6 dimensions

**Tools**:

| Language | Tool | Metrics |
|----------|------|---------|
| Go | gocyclo + goimports + custom | Cyclomatic <10, imports grouped, cohesion check |
| TypeScript | complexity-report | Cyclomatic <15, cognitive <10 |
| Python | radon | Cyclomatic <10, maintainability A/B |

**Pass Criteria**: Composite ≥80, no dimension <50
**Violation**: Refactor flagged code, re-run

---

### **Layer 6: Convergence (SOFT → determinism check)**

**Purpose**: Verify layer 5 scores are deterministic (not random)
**Gate**: SOFT
**Method**: Run layer 5 twice, compare scores

**Pass Criteria**: Δ < 2% between runs
**Violation**: Identify non-deterministic metric, fix tool, re-run

---

### **Layer 7: Correspondence (HARD)**

**Purpose**: Each property verified by ≥3 layers
**Gate**: BLOCKING
**Artifact**: `correspondence-matrix.json`

**Format**:
```json
{
  "properties": [
    {
      "name": ".tgz extraction",
      "layers": ["L-1", "L0", "L2"],
      "coverage": 3,
      "required": 3,
      "status": "PASS"
    },
    {
      "name": "SCMNode mapping",
      "layers": ["L-1", "L0", "L2", "L5"],
      "coverage": 4,
      "required": 3,
      "status": "PASS"
    }
  ]
}
```

**Validation**: `jql '"properties" | select(.coverage < 3)' < correspondence-matrix.json`
**Pass Criteria**: All properties have coverage ≥3
**Violation**: Add missing layer verifications, re-run

---

### **Layer 8: Completeness (HARD)**

**Purpose**: All acceptance criteria from Tier 3 specs are met
**Gate**: BLOCKING
**Artifact**: `completeness-manifest.json`

**Format**:
```json
{
  "component": "pkg/fhir/parser.go",
  "acceptance_criteria": [
    {
      "id": "TC-01",
      "description": "CARIN BB .tgz → 16 profiles",
      "test": "TestParsePackageCARIN",
      "status": "PASS",
      "evidence": "Line 45: assert len(profiles) == 16"
    },
    {
      "id": "TC-02",
      "description": "US Core .tgz → 59 profiles",
      "test": "TestParsePackageUSCore",
      "status": "PASS",
      "evidence": "Line 67: assert len(profiles) == 59"
    }
  ],
  "applied": 2,
  "total": 2,
  "status": "PASS"
}
```

**Validation**: `jql '"applied" == "total"' < completeness-manifest.json`
**Pass Criteria**: applied == total
**Violation**: Implement missing criteria, re-run

---

### **Layer 9: Artifact Chain (HARD)**

**Purpose**: Validation report exists and is complete
**Gate**: BLOCKING
**Artifact**: `validation-report.md`

**Required Sections**:
1. Component metadata (package, LOC)
2. Layer results table (L-1 through L10 status)
3. Layer 5 score breakdown
4. Layer 7 correspondence matrix
5. Layer 8 acceptance criteria list

**Validation**: Check all sections present
**Pass Criteria**: All sections exist, no placeholders
**Violation**: Generate complete report, re-run

---

### **Layer 10: Determinism (HARD)**

**Purpose**: Running validation twice produces identical results
**Gate**: BLOCKING
**Method**: Run layers -1 through 9 twice, byte-compare outputs

**Pass Criteria**: Identical test counts, identical coverage %, identical scores
**Violation**: Fix non-deterministic code (time-based logic, random data), re-run

---

## Workflow: Isolation-Based Orchestration

### **Phase 1: Specification Generation**

#### **Step 1.1: Tier 1 System Spec**
**Agent**: A1 (fresh context)
**Prompt**:
```
You are a system architect. Read the requirements and existing codebase (read-only).
Generate a Tier 1 System Specification that decomposes the system into subsystems.

Output format: tier1-system-spec.md

Do NOT write code. Do NOT implement. Spec only.
```

**Input**: User requirements, existing codebase
**Output**: `tier1-system-spec.md`
**Approval**: Human review → lock file (immutable)

---

#### **Step 1.2: Tier 2 Subsystem Specs**
**Agent**: A2-1, A2-2, ... (fresh context per subsystem)
**Prompt**:
```
You are a subsystem architect. Read tier1-system-spec.md.
Generate a Tier 2 Subsystem Specification for subsystem X that decomposes it into components.

Output format: tier2-X-spec.md

Do NOT write code. Do NOT implement. Spec only.
```

**Input**: `tier1-system-spec.md` + subsystem name
**Output**: `tier2-<subsystem>-spec.md` (one per subsystem)
**Approval**: Human review → lock files (immutable)

---

#### **Step 1.3: Tier 3 Component Specs**
**Agent**: A3-1, A3-2, ... (fresh context per component)
**Prompt**:
```
You are a component architect. Read tier2-X-spec.md.
Generate a Tier 3 Component Specification for component Y that details all functions.

Include:
- Function signatures
- Preconditions, postconditions, error conditions
- Acceptance criteria (concrete test cases)

Output format: tier3-Y-spec.md

Do NOT write code. Do NOT implement. Spec only.
```

**Input**: `tier2-<subsystem>-spec.md` + component name
**Output**: `tier3-<component>-spec.md` (one per component)
**Approval**: Human review → lock files (immutable)

---

#### **Step 1.4: Integration Spec**
**Agent**: A4 (fresh context)
**Prompt**:
```
You are an integration architect. Read all tier1/tier2/tier3 specs.
Generate an Integration Specification that documents all cross-file dependencies.

Include:
- Shared types (must stay consistent)
- Constants/enums used across components
- API contracts between components
- Global invariants

Output format: integration-spec.md

Do NOT write code. Do NOT implement. Spec only.
```

**Input**: All tier 1/2/3 specs
**Output**: `integration-spec.md`
**Approval**: Human review → lock file (immutable)

---

### **Phase 2: Validation Artifact Generation**

#### **Step 2.1: Generate Artifacts**
**Agent**: A5-1, A5-2, ... (fresh context per component)
**Prompt**:
```
You are a validation engineer. Read tier3-Y-spec.md and integration-spec.md.
Generate validation artifacts for component Y:

1. Test file skeleton (from acceptance criteria)
2. Contract annotations (from pre/post/error conditions)
3. Correspondence matrix (properties this component verifies)
4. Completeness manifest (acceptance criteria IDs)

Output:
- tests/Y_test.<ext>
- correspondence-Y.json
- completeness-Y.json

Do NOT write implementation code. Validation artifacts only.
```

**Input**: `tier3-<component>-spec.md` + `integration-spec.md`
**Output**: Validation artifacts (tests skeleton, matrices)
**Next**: Artifact audit

---

#### **Step 2.2: Audit Artifacts**
**Agent**: A6 (fresh context, independent auditor)
**Prompt**:
```
You are an auditor. Review validation artifacts for component Y.

Check:
1. All acceptance criteria have corresponding test cases
2. All function signatures have contracts
3. Correspondence matrix covers all properties
4. No omissions, no placeholders

Output: audit-Y-report.md (PASS/FAIL)

If FAIL, list specific issues. Do NOT fix — report only.
```

**Input**: Validation artifacts
**Output**: Audit report (PASS/FAIL + issues list)
**Approval**: If PASS → lock artifacts (immutable). If FAIL → regenerate (Step 2.1) with issue list, re-audit

---

### **Phase 3: Code Generation**

#### **Step 3.1: Generate Code**
**Agent**: A7-1, A7-2, ... (fresh context per component, ONE SHOT)
**Prompt**:
```
You are a code generator. Read:
- tier3-Y-spec.md (component spec)
- integration-spec.md (cross-file consistency)
- Validation artifacts (tests, contracts)

Generate implementation code for component Y that passes all validation layers.

You get ONE SHOT. Submit code when done.

Output: src/Y.<ext>
```

**Input**: Tier 3 spec + integration spec + validation artifacts
**Output**: Source code
**Next**: Validation run

---

#### **Step 3.2: Run Validation**
**System**: Automated (no agent)
**Process**:
1. Run layer -1 (self-validation)
2. Run layer 0 (static analysis)
3. Run layer 1 (contract check)
4. Run layer 2 (tests)
5. Run layer 3 (anti-hollow)
6. Run layer 4 (security)
7. Run layer 5 (architecture scores)
8. Run layer 6 (convergence)
9. Run layer 7 (correspondence)
10. Run layer 8 (completeness)
11. Run layer 9 (artifact chain)
12. Run layer 10 (determinism)

**Output**: Pass/fail report with error messages
**Next**: If PASS → done. If FAIL → Step 3.3

---

#### **Step 3.3: Fix Code (Iteration)**
**Agent**: A8-1, A8-2, ... (fresh context per fix attempt, ONE SHOT)
**Prompt**:
```
You are a code fixer. The previous code failed validation.

Read:
- tier3-Y-spec.md (component spec)
- integration-spec.md (cross-file consistency)
- Validation artifacts (tests, contracts)
- FAILED code (src/Y.<ext>)
- Error messages (validation-errors.txt)

Fix the code to pass validation.

You get ONE SHOT. Submit fixed code when done.

Output: src/Y.<ext> (overwrite)
```

**Input**: Spec + artifacts + failed code + error messages
**Output**: Fixed code
**Next**: Validation run (Step 3.2)

**Loop**: Repeat Step 3.3 → 3.2 until PASS or max iterations (10)

---

## Anti-Reward-Hacking Mechanisms

### **1. Context Isolation**
- Each agent gets **fresh context window**
- No shared memory between spec/artifact/code/fix agents
- Agents cannot "remember" failed attempts to game validation

### **2. One-Shot Enforcement**
- Code generation: **1 try per agent**
- Fix generation: **1 try per agent**
- Forces correct implementation (not trial-and-error convergence)

### **3. Immutable Artifacts**
- Specs locked after approval
- Validation artifacts locked after audit
- Only code is mutable during fix iterations
- Prevents "moving the goalposts" to match bad code

### **4. Deterministic Gates**
- No AI-based validation (probabilistic)
- Only binary go/no-go tests (exit 0 = pass)
- No loopholes, no graceful degradation

### **5. Independent Auditing**
- Artifact auditor (A6) is separate from artifact generator (A5)
- No self-validation
- Auditor can only report issues, not fix them

### **6. Completeness Enforcement**
- All acceptance criteria must be implemented
- Correspondence matrix requires 3+ layer coverage per property
- No "80% done" — 100% or fail

### **7. Hollow Pattern Detection**
- Layer 3 blocks empty/trivial implementations
- Tests must verify actual behavior changes
- No hardcoded test data matching expected outputs

---

## Language Module Structure

Each language gets a validation module directory:

```
.outline/outline-strong/modules/
├── go/
│   ├── README.md               # Tool installation, usage
│   ├── layer-n1.sh             # Self-validation script
│   ├── layer-0.sh              # Static analysis script
│   ├── layer-1.sh              # Contract check script
│   ├── layer-2.sh              # Test runner script
│   ├── layer-3.sh              # Hollow scanner script
│   ├── layer-4.sh              # Security audit script
│   ├── layer-5.sh              # Architecture scorer script
│   ├── layer-6.sh              # Convergence checker script
│   ├── layer-7.sh              # Correspondence validator script
│   ├── layer-8.sh              # Completeness checker script
│   ├── layer-9.sh              # Artifact chain validator script
│   ├── layer-10.sh             # Determinism checker script
│   └── tools/
│       ├── hollow-scanner.go   # Custom hollow pattern detector
│       ├── arch-scorer.go      # Custom architecture metrics
│       └── contract-check.go   # Custom contract annotation parser
├── typescript/
│   ├── README.md
│   ├── layer-n1.sh
│   ├── layer-0.sh
│   └── ...
├── python/
│   ├── README.md
│   ├── layer-n1.sh
│   ├── layer-0.sh
│   └── ...
└── shell/
    ├── README.md
    ├── layer-n1.sh
    ├── layer-0.sh
    └── ...
```

---

## Orchestration Script

Master validation runner:

```bash
#!/bin/bash
# .outline/outline-strong/validate-component.sh

set -e

COMPONENT=$1
LANGUAGE=$2

if [[ -z "$COMPONENT" || -z "$LANGUAGE" ]]; then
    echo "Usage: $0 <component> <language>"
    exit 1
fi

MODULE_DIR=".outline/outline-strong/modules/$LANGUAGE"
if [[ ! -d "$MODULE_DIR" ]]; then
    echo "Error: Language module not found: $LANGUAGE"
    exit 1
fi

echo "=== VALIDATING COMPONENT: $COMPONENT ($LANGUAGE) ==="
echo ""

# Run all layers in order
for layer in -n1 -0 -1 -2 -3 -4 -5 -6 -7 -8 -9 -10; do
    layer_num=$(echo "$layer" | tr -d '-')
    script="$MODULE_DIR/layer${layer}.sh"

    if [[ -f "$script" ]]; then
        echo "[Layer $layer_num] Running..."
        if ! bash "$script" "$COMPONENT"; then
            echo "❌ Layer $layer_num FAILED"
            exit $((10 + layer_num))
        fi
        echo "✅ Layer $layer_num PASS"
        echo ""
    else
        echo "⚠️  Layer $layer_num script not found (skipping)"
        echo ""
    fi
done

echo "=== ALL LAYERS PASS ==="
exit 0
```

**Usage**:
```bash
.outline/outline-strong/validate-component.sh pkg/fhir go
.outline/outline-strong/validate-component.sh website/components/Hero typescript
```

---

## Implementation Roadmap

### **Phase 0: Setup (Week 1)**
1. Create directory structure (`.outline/outline-strong/modules/`)
2. Install language-specific tools (gosec, pyright, shellcheck, etc.)
3. Test each tool independently

### **Phase 1: Go Module (Week 2-3)**
1. Implement all 12 layer scripts for Go
2. Test on existing TESSARA components (COMP-00 through COMP-09)
3. Validate against existing validation reports
4. Fix false positives (hollow scanner, security audit)

### **Phase 2: TypeScript Module (Week 4)**
1. Implement layer scripts for TypeScript
2. Test on Astro website components
3. Tune architecture scorer for TS patterns

### **Phase 3: Python Module (Week 5)**
1. Implement layer scripts for Python
2. Test on existing scripts
3. Integrate `deal` for contract validation

### **Phase 4: Shell Module (Week 6)**
1. Implement layer scripts for Shell
2. Test on automation scripts
3. Add bats for behavioral tests

### **Phase 5: Orchestration (Week 7)**
1. Implement master validation script
2. Create agent workflow orchestrator (spec → artifact → code → fix)
3. Test end-to-end on one component

### **Phase 6: Full System Test (Week 8)**
1. Run complete workflow on new component
2. Measure time to validation pass
3. Identify bottlenecks, optimize
4. Document lessons learned

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Validation automation | 100% | All layers run without human intervention |
| False positive rate | <5% | Hollow scanner, security audit |
| Time to first pass | <4 hours | Spec → code → validation pass (new component) |
| Fix iteration count | <3 | Average iterations to pass validation |
| Determinism | 100% | Layer 10 passes on all components |
| Coverage | ≥80% | All components meet coverage threshold |

---

## Open Questions

1. **Max fix iterations**: Hard limit at 10? Or fail-fast at 3?
2. **Parallel validation**: Can layers run concurrently, or must they be sequential?
3. **Artifact storage**: Git LFS for large correspondence matrices?
4. **Human approval**: Auto-approve specs after N successful validations, or always manual?
5. **Language extensions**: Rust, Java, Kotlin modules needed?

---

## References

- TESSARA existing Outline-Strong: `.outline/outline-strong/`
- Original ODIN Outline-Driven Development: (external reference needed)
- Go validation tools: gosec, govulncheck, gocyclo
- TypeScript validation tools: tsc, eslint, vitest
- Python validation tools: pyright, bandit, safety, deal
- Shell validation tools: shellcheck, shfmt, bats

---

**Version**: 2.0.0
**Status**: Ready for implementation
**Next Step**: Build Go module (Phase 1)
