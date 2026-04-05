# Go Language Module — Outline-Strong v2.0

**Language**: Go 1.25+
**Purpose**: 12-layer validation for Go components

---

## Required Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| go | Compiler, test runner | System package |
| golangci-lint | Linter aggregator | `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest` |
| gosec | Security scanner | `go install github.com/securego/gosec/v2/cmd/gosec@latest` |
| govulncheck | Vulnerability scanner | `go install golang.org/x/vuln/cmd/govulncheck@latest` |
| gocyclo | Complexity analyzer | `go install github.com/fzipp/gocyclo/cmd/gocyclo@latest` |
| staticcheck | Advanced static analysis | `go install honnef.co/go/tools/cmd/staticcheck@latest` |

**Install all**:
```bash
bash modules/go/install-tools.sh
```

---

## Layer Scripts

| Layer | Script | Purpose |
|-------|--------|---------|
| -1 | layer-n1.sh | Self-validation (build + vet + test) |
| 0 | layer-0.sh | Static analysis (go vet + staticcheck) |
| 1 | layer-1.sh | Contract annotations |
| 2 | layer-2.sh | Test suite (coverage ≥80%) |
| 3 | layer-3.sh | Anti-hollow patterns |
| 4 | layer-4.sh | Security audit (gosec + govulncheck) |
| 5 | layer-5.sh | Architecture scores |
| 6 | layer-6.sh | Convergence (determinism check) |
| 7 | layer-7.sh | Correspondence matrix |
| 8 | layer-8.sh | Completeness manifest |
| 9 | layer-9.sh | Artifact chain validation |
| 10 | layer-10.sh | Determinism verification |

---

## Usage

### Validate Single Component
```bash
cd /home/swarm/TESSARA
bash .outline/outline-strong/modules/go/layer-n1.sh pkg/fhir
bash .outline/outline-strong/modules/go/layer-0.sh pkg/fhir
# ... continue through layer 10
```

### Validate All Layers (Orchestrator)
```bash
bash .outline/outline-strong/validate-component.sh pkg/fhir go
```

---

## Contract Annotation Format

```go
// FunctionName does X
// @pre: condition1 (e.g., r is valid .tgz stream)
// @post: result condition OR error returned
// @error: error cases (e.g., tar corrupt, malformed JSON)
func FunctionName(args) (result, error) {
    // ...
}
```

**Example**:
```go
// ParsePackage extracts FHIR IG package from .tgz archive
// @pre: r is valid gzipped tar stream
// @post: Package with profiles keyed by canonical URL OR error returned
// @error: tar read error, package.json missing, JSON unmarshal error
func ParsePackage(r io.Reader) (*Package, error) {
    // ...
}
```

---

## Architecture Score Dimensions

1. **Coupling** (0-100): Module dependency count (lower = better)
2. **Cohesion** (0-100): Single responsibility (higher = better)
3. **Complexity** (0-100): Cyclomatic complexity (lower = better)
4. **Interface Compliance** (0-100): Exported API quality
5. **Error Handling** (0-100): Error wrapping coverage
6. **Package Design** (0-100): Logical grouping quality

**Composite Score**: Average of 6 dimensions
**Pass Threshold**: ≥80 composite, all dimensions ≥50

---

## Hollow Pattern Examples

### ❌ Banned Patterns

1. **Empty return without logic**
```go
func Process(data []byte) error {
    return nil  // HOLLOW
}
```

2. **Test without assertions**
```go
func TestProcess(t *testing.T) {
    Process(data)  // HOLLOW — no verification
}
```

3. **Hardcoded test data**
```go
func CalculateTotal(items []int) int {
    return 42  // HOLLOW — not calculated
}
```

4. **Silent error swallowing**
```go
result, err := DoWork()
if err != nil {
    // HOLLOW — error ignored
}
```

### ✅ Valid Patterns (Not Hollow)

1. **Validation function**
```go
func ValidateConfig(cfg *Config) error {
    if cfg.Port < 0 {
        return fmt.Errorf("invalid port: %d", cfg.Port)
    }
    // ... more validation
    return nil  // OK — validated
}
```

2. **Test with verification**
```go
func TestProcess(t *testing.T) {
    result := Process(data)
    require.NoError(t, result)
    assert.Equal(t, expected, actual)  // OK — verified
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Layer PASS |
| 11 | Layer -1 failed (build/vet/test) |
| 10 | Layer 0 failed (static analysis) |
| 21 | Layer 1 failed (missing contracts) |
| 22 | Layer 2 failed (tests/coverage) |
| 23 | Layer 3 failed (hollow patterns) |
| 24 | Layer 4 failed (security) |
| 25 | Layer 5 failed (architecture) |
| 26 | Layer 6 failed (convergence) |
| 27 | Layer 7 failed (correspondence) |
| 28 | Layer 8 failed (completeness) |
| 29 | Layer 9 failed (artifact chain) |
| 30 | Layer 10 failed (determinism) |

---

## Version

- **Module Version**: 2.0.0
- **Go Version**: 1.25+
- **Last Updated**: 2026-04-05
