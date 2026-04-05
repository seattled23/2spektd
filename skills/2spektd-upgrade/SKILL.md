# /2spektd:upgrade — Validate and Upgrade Existing Code

**Purpose**: Run 12-layer validation on existing code and optionally enter fix loop to bring it up to production standards.

---

## Usage

```bash
/2spektd:upgrade <component-path> [language]
```

**Examples**:
```bash
/2spektd:upgrade pkg/analytics go
/2spektd:upgrade src/components/Dashboard typescript
/2spektd:upgrade scripts/deploy python
/2spektd:upgrade scripts/backup.sh shell

# Auto-detect language (if possible)
/2spektd:upgrade pkg/analytics
```

---

## Workflow

### Step 1: Language Detection

If language not specified:
- Check file extensions (`.go`, `.ts`, `.py`, `.sh`)
- Ask user to confirm detected language

### Step 2: Run 12-Layer Validation

Execute validation layers sequentially:

| Layer | Check | Typical Failures |
|-------|-------|-----------------|
| -1 | Build/import/syntax | Syntax errors, missing deps |
| 0 | Static analysis | Type errors, unused imports |
| 1 | Contract annotations | Missing @pre/@post/@error |
| 2 | Tests + coverage ≥80% | Missing tests, low coverage |
| 3 | Anti-hollow patterns | Empty functions, no assertions |
| 4 | Security audit | Vulnerabilities, unsafe patterns |
| 5 | Architecture ≥80 | High coupling, complexity |
| 6 | Convergence Δ <2% | Architecture drift from baseline |
| 7 | Correspondence ≥3 layers/property | Incomplete property coverage |
| 8 | Completeness | Missing acceptance criteria |
| 9 | Artifact chain | Missing validation report |
| 10 | Determinism | Non-deterministic tests |

Stops at first failure.

### Step 3: Report Results

**If all layers pass**:
```
✅ ALL LAYERS PASSED
Component: pkg/analytics
Language: go
Coverage: 94.3%
Architecture: 87.2/100
```

**If layer fails**:
```
❌ VALIDATION FAILED at Layer 1: Contract Annotations

Missing contracts on 3 functions:
  - Analyze (line 42)
  - GenerateReport (line 108)
  - ExportCSV (line 156)

Fix by adding @pre/@post/@error annotations.
```

### Step 4: Optional Fix Loop

After reporting failure:

```
Enter fix loop? (y/n):
```

If yes:
1. Generate fix in fresh context
2. Re-run validation
3. Loop until PASS or user interrupts

Each iteration shows:
- Iteration count
- Layer failing
- Specific errors
- Progress indicators

---

## What Gets Validated

### Layer -1: Self-Validation
- **Go**: `go build`, `go vet`, `go test`
- **TypeScript**: `tsc --noEmit`, `eslint`, `vitest run`
- **Python**: Import check, `pytest`
- **Shell**: `bash -n` (syntax check)

### Layer 0: Static Analysis
- **Go**: `staticcheck`
- **TypeScript**: `tsc --strict`
- **Python**: `pyright --strict`
- **Shell**: `shellcheck`

### Layer 1: Contract Annotations
- **Go**: `@pre/@post/@error` in comments
- **TypeScript**: `@pre/@post/@throws` in TSDoc
- **Python**: `@deal.pre/@deal.post/@deal.raises` decorators
- **Shell**: N/A (skipped)

### Layer 2: Tests + Coverage
- **Go**: `go test -cover` ≥80%
- **TypeScript**: `vitest --coverage` ≥80%
- **Python**: `pytest --cov` ≥80%
- **Shell**: `bats` tests

### Layer 3: Anti-Hollow Patterns
- Empty functions
- Tests without assertions
- Silent error swallowing

### Layer 4: Security
- **Go**: `gosec`, `govulncheck`
- **TypeScript**: `npm audit`
- **Python**: `bandit`, `safety`
- **Shell**: Unsafe pattern detection

### Layer 5: Architecture Scores
6 dimensions (composite ≥80):
- Coupling
- Cohesion
- Complexity
- Error handling
- Type safety / Type hints
- Module design

### Layers 6-10: Advanced Validation
- **6**: Convergence from baseline
- **7**: Property coverage (≥3 layers each)
- **8**: All acceptance criteria implemented
- **9**: Complete artifact chain
- **10**: Deterministic tests

---

## Output

### Validation Report

Saved to `.2spektd/reports/{component}-{timestamp}.md`:

```markdown
# Validation Report: pkg/analytics

**Date**: 2026-04-05 10:30:00
**Language**: go
**Result**: FAIL at Layer 1

## Layer Results

- [x] Layer -1: PASS
- [x] Layer 0: PASS
- [ ] Layer 1: FAIL - Missing 3 contracts
- [ ] Layer 2: PENDING
- [ ] Layer 3: PENDING
...

## Details

### Layer 1: Contract Annotations
Missing contracts:
- Analyze (pkg/analytics/analyzer.go:42)
- GenerateReport (pkg/analytics/report.go:108)
- ExportCSV (pkg/analytics/export.go:156)

Recommendation: Add @pre/@post/@error annotations
```

---

## Fix Loop Details

When entering fix loop:

1. **Context Isolation** — Each fix in fresh context
2. **Incremental Progress** — Each iteration fixes more issues
3. **Unlimited Iterations** — Loops until PASS
4. **User Control** — Ctrl+C to interrupt anytime

Example session:
```
════════════════════════════════════════════════════════════════
Fix Iteration 1
════════════════════════════════════════════════════════════════

Analyzing Layer 1 failure...
Adding contract annotations to 3 functions...

🧪 Re-running validation...

❌ Still failing at Layer 1 (1 function remaining)

════════════════════════════════════════════════════════════════
Fix Iteration 2
════════════════════════════════════════════════════════════════

Fixing remaining contract...

🧪 Re-running validation...

✅ Layer 1: PASS
❌ Layer 2: FAIL - Coverage 72% (need ≥80%)

════════════════════════════════════════════════════════════════
Fix Iteration 3
════════════════════════════════════════════════════════════════

Adding tests for uncovered code paths...

🧪 Re-running validation...

✅ Layer 2: PASS
✅ ALL LAYERS PASSED

Total iterations: 3
```

---

## Tips for Success

1. **Start Clean** — Commit changes before validation
2. **Read Error Messages** — Specific line numbers provided
3. **Let Loop Run** — Each iteration improves code
4. **Use Reports** — Saved to `.2spektd/reports/`
5. **Baseline Once** — First run creates architecture baseline

---

## Exit Codes

- **0**: All layers passed
- **10**: Layer 0 failed (static analysis)
- **11**: Layer -1 failed (build/syntax)
- **21-30**: Layers 1-10 failed
- **130**: User interrupted fix loop

---

## References

- **Validation Spec**: `validation/OUTLINE-STRONG-V2-SPEC.md`
- **Quick Start**: `validation/QUICK-START.md`
- **Module Docs**: `validation/modules/{language}/README.md`
