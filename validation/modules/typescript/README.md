# TypeScript Validation Module — Outline-Strong v2.0

**Purpose**: 12-layer deterministic validation for TypeScript/Astro components

---

## Tools Required

| Tool | Purpose | Install |
|------|---------|---------|
| `tsc` | Type checking | `bun install -g typescript` |
| `eslint` | Linting | `bun install -g eslint` |
| `vitest` | Testing | `bun install -g vitest` |
| `npm` | Audit | Built-in |
| `complexity-report` | Complexity | `bun install -g complexity-report` |

**Quick Install**: `bash install-tools.sh`

---

## 12 Validation Layers

| Layer | Script | Purpose | Exit Code |
|-------|--------|---------|-----------|
| **-1** | `layer-n1.sh` | Build + lint + test | 11 |
| **0** | `layer-0.sh` | Type checking (strict) | 10 |
| **1** | `layer-1.sh` | Contract annotations (TSDoc) | 21 |
| **2** | `layer-2.sh` | Test suite + ≥80% coverage | 22 |
| **3** | `layer-3.sh` | Anti-hollow patterns | 23 |
| **4** | `layer-4.sh` | Security audit (npm) | 24 |
| **5** | `layer-5.sh` | Architecture scores ≥80 | 25 |
| **6** | `layer-6.sh` | Convergence (Δ <2%) | 26 |
| **7** | `layer-7.sh` | Correspondence matrix | 27 |
| **8** | `layer-8.sh` | Completeness manifest | 28 |
| **9** | `layer-9.sh` | Artifact chain | 29 |
| **10** | `layer-10.sh` | Determinism | 30 |

---

## Contract Annotation Format (Layer 1)

```typescript
/**
 * FunctionName does X
 * @pre condition (e.g., user is authenticated)
 * @post result condition OR throws error
 * @throws ErrorType - when condition fails
 */
export function FunctionName(args: Type): ReturnType {
    // implementation
}
```

**Example**:
```typescript
/**
 * Validates user credentials and returns session token
 * @pre email and password are non-empty strings
 * @post returns JWT token OR throws AuthenticationError
 * @throws AuthenticationError - invalid credentials
 * @throws ValidationError - missing email/password
 */
export async function authenticate(email: string, password: string): Promise<string> {
    // ...
}
```

**All exported functions MUST have @pre/@post/@throws**

---

## Layer Descriptions

### Layer -1: Self-Validation
- `tsc --noEmit` (type check)
- `eslint .` (lint)
- `vitest run` (all tests pass)
- **Exit 11** if any fail

### Layer 0: Static Analysis
- `tsc --strict --noEmit` (strictest type checking)
- **Exit 10** on type errors

### Layer 1: Contract Annotations
- Check all exported functions for `@pre/@post/@throws`
- **Exit 21** if missing

### Layer 2: Test Suite
- `vitest run --coverage`
- Coverage ≥80%
- **Exit 22** if below threshold or tests fail

### Layer 3: Anti-Hollow Patterns
Detects:
1. Functions returning only `null`/`undefined`
2. Tests without `expect()` assertions
3. Silent error swallowing (`catch {}`)

**Exit 23** if hollow patterns found

### Layer 4: Security Audit
- `npm audit --production --audit-level=high`
- **Exit 24** on vulnerabilities

### Layer 5: Architecture Scores
6 dimensions (each 0-100):
1. **Coupling**: Import count per file
2. **Cohesion**: Functions per file
3. **Complexity**: Cyclomatic complexity
4. **Error Handling**: try/catch coverage
5. **Type Safety**: `any` usage
6. **Module Design**: Circular dependencies

**Composite ≥80**, all dimensions ≥50
**Exit 25** if below threshold

### Layer 6: Convergence
- Compare current architecture scores to baseline
- **Δ must be <2%**
- **Exit 26** if divergence too high

### Layer 7: Correspondence Matrix
- Validate `.../correspondence-X.json`
- Each property must have ≥3 layers validating it
- **Exit 27** if incomplete

### Layer 8: Completeness Manifest
- Validate `.../completeness.json`
- All acceptance criteria implemented
- **Exit 28** if incomplete

### Layer 9: Artifact Chain
- Validate validation report exists and is complete
- **Exit 29** if missing/incomplete

### Layer 10: Determinism
- Run Layer 2 tests twice
- Results must be identical
- **Exit 30** if non-deterministic

---

## Usage

**Validate component**:
```bash
cd /home/swarm/TESSARA
bash .spec2/outline-strong/validate-component.sh website/src/components typescript
```

**Run single layer**:
```bash
bash .spec2/outline-strong/modules/typescript/layer-1.sh website/src/components
```

---

## Configuration Files

TypeScript validation expects:
- `tsconfig.json` with `strict: true`
- `eslint.config.js` or `.eslintrc.js`
- `vitest.config.ts`

---

**Version**: 1.0.0 (Phase 2)
**Last Updated**: 2026-04-05
