# Outline-Strong v2.0 — Quick Start Guide

**Status**: ALL PHASES COMPLETE (Go, TypeScript, Python, Shell + Agent Orchestration)
**Date**: 2026-04-05

---

## What Is This?

Outline-Strong v2.0 is a **12-layer validation system** for deterministic code quality enforcement with:
- ✅ No AI-based validation (binary go/no-go tests only)
- ✅ Anti-reward-hacking (isolation, immutability, one-shot agents)
- ✅ Language-specific modules (Go complete, TypeScript/Python/Shell designed)
- ✅ Complete coverage (≥3 layers per property, all acceptance criteria)

---

## Quick Commands

### **Validate a Component**
```bash
cd /home/swarm/TESSARA
bash .spec2/outline-strong/validate-component.sh <component> <language>
```

**Examples**:
```bash
# Go component
bash .spec2/outline-strong/validate-component.sh pkg/jcs go
bash .spec2/outline-strong/validate-component.sh pkg/fhir go
bash .spec2/outline-strong/validate-component.sh internal/scm go

# TypeScript (when module built)
bash .spec2/outline-strong/validate-component.sh website/src/components typescript

# Python (when module built)
bash .spec2/outline-strong/validate-component.sh scripts python
```

### **Install Go Validation Tools**
```bash
bash .spec2/outline-strong/modules/go/install-tools.sh
```

Installs: golangci-lint, gosec, govulncheck, gocyclo, staticcheck

### **Run Single Layer**
```bash
bash .spec2/outline-strong/modules/go/layer-1.sh pkg/jcs
bash .spec2/outline-strong/modules/go/layer-2.sh pkg/jcs
# ... etc
```

---

## 12 Validation Layers (Go)

| Layer | Name | Purpose | Exit Code |
|-------|------|---------|-----------|
| **-1** | Self-Validation | Build + vet + test | 11 |
| **0** | Static Analysis | go vet + staticcheck | 10 |
| **1** | Contracts | @pre/@post/@error annotations | 21 |
| **2** | Tests | Test suite + ≥80% coverage | 22 |
| **3** | Anti-Hollow | No empty/trivial implementations | 23 |
| **4** | Security | gosec + govulncheck | 24 |
| **5** | Architecture | 6 dimensions, ≥80 composite | 25 |
| **6** | Convergence | Determinism check (Δ <2%) | 26 |
| **7** | Correspondence | ≥3 layers per property | 27 |
| **8** | Completeness | All acceptance criteria | 28 |
| **9** | Artifact Chain | Validation report complete | 29 |
| **10** | Determinism | Identical test runs | 30 |

**Exit 0 = PASS, non-zero = FAIL**

---

## Contract Annotation Format (Layer 1)

```go
// FunctionName does X
// @pre: condition (e.g., r is valid .tgz stream)
// @post: result condition OR error returned
// @error: error cases (e.g., tar corrupt, malformed JSON)
func FunctionName(args) (result, error) {
    // implementation
}
```

**Example**:
```go
// Canonicalize converts JSON to RFC 8785 JCS format
// @pre: data contains valid JSON bytes
// @post: returns canonicalized bytes OR error
// @error: JSON unmarshal failure, unsupported number format
func Canonicalize(data []byte) ([]byte, error) {
    // ...
}
```

**All exported functions MUST have @pre/@post/@error**

---

## What's Built vs. Not Built

### ✅ **Built (ALL PHASES)**
- [x] Complete specification (OUTLINE-STRONG-V2-SPEC.md)
- [x] Go module (12 layer scripts)
- [x] TypeScript module (12 layer scripts)
- [x] Python module (12 layer scripts)
- [x] Shell module (8 adapted layer scripts)
- [x] Master orchestrator (validate-component.sh)
- [x] Agent orchestration (8 agents + orchestrate-build.sh)
- [x] Implementation status tracker
- [x] Tested on pkg/jcs

### ⏳ **Ready for Testing**
- [ ] End-to-end test on new component
- [ ] Validate all 10 TESSARA components
- [ ] Measure false positive rate
- [ ] Optimize based on results

---

## Common Issues

### **Issue**: "Missing contract annotations"
**Solution**: Add `@pre/@post/@error` to all exported functions

### **Issue**: "Coverage below threshold"
**Solution**: Write tests until ≥80% coverage

### **Issue**: "Hollow patterns detected"
**Solution**: No empty functions, tests must have assertions, no silent error swallowing

### **Issue**: "gocyclo not found"
**Solution**: Run `bash .spec2/outline-strong/modules/go/install-tools.sh`

---

## File Locations

```
.spec2/outline-strong/
├── OUTLINE-STRONG-V2-SPEC.md       # Complete 61KB specification
├── IMPLEMENTATION-STATUS.md        # 14KB status tracker
├── SESSION-2026-04-05.md           # Build session summary
├── QUICK-START.md                  # This file
├── validate-component.sh           # Master orchestrator
└── modules/
    └── go/
        ├── README.md               # Go module documentation
        ├── install-tools.sh        # Tool installer
        ├── layer-n1.sh             # Self-validation
        ├── layer-0.sh              # Static analysis
        ├── layer-1.sh              # Contracts
        ├── layer-2.sh              # Tests
        ├── layer-3.sh              # Anti-hollow
        ├── layer-4.sh              # Security
        ├── layer-5.sh              # Architecture
        ├── layer-6.sh              # Convergence
        ├── layer-7.sh              # Correspondence
        ├── layer-8.sh              # Completeness
        ├── layer-9.sh              # Artifact chain
        └── layer-10.sh             # Determinism
```

---

## Next Steps

### **To Continue Implementation**:
1. Read `IMPLEMENTATION-STATUS.md` for roadmap
2. Build TypeScript module (copy Go module pattern)
3. Build Python module
4. Build Shell module
5. Build agent orchestration scripts
6. End-to-end test

### **To Test on TESSARA**:
1. Add contracts to `pkg/jcs/canonicalize.go` and `pkg/jcs/number.go`
2. Run validation: `bash .spec2/outline-strong/validate-component.sh pkg/jcs go`
3. Fix any failures
4. Repeat for all 10 components

### **To Use for New Components**:
1. Write Tier 3 spec (component → functions)
2. Generate validation artifacts (tests, matrices)
3. Generate code
4. Run validation
5. Fix until all layers pass

---

## Documentation

- **Full Spec**: `OUTLINE-STRONG-V2-SPEC.md` (read first for design)
- **Status**: `IMPLEMENTATION-STATUS.md` (read for roadmap)
- **Session Summary**: `SESSION-2026-04-05.md` (read for context)
- **Go Module**: `modules/go/README.md` (read for tools)

---

**Version**: 1.0.0 (Phase 1)
**Last Updated**: 2026-04-05
