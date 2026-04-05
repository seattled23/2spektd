# Python Validation Module — Outline-Strong v2.0

**Purpose**: 12-layer deterministic validation for Python components

---

## Tools Required

| Tool | Purpose | Install |
|------|---------|---------|
| `pyright` | Type checking | `pip install pyright` |
| `pytest` | Testing | `pip install pytest pytest-cov` |
| `bandit` | Security | `pip install bandit` |
| `safety` | Vulnerabilities | `pip install safety` |
| `deal` | Contracts | `pip install deal` |
| `radon` | Complexity | `pip install radon` |

**Quick Install**: `bash install-tools.sh`

---

## 12 Validation Layers

| Layer | Script | Purpose | Exit Code |
|-------|--------|---------|-----------|
| **-1** | `layer-n1.sh` | Import + test | 11 |
| **0** | `layer-0.sh` | Type checking (strict) | 10 |
| **1** | `layer-1.sh` | Contract decorators (deal) | 21 |
| **2** | `layer-2.sh` | Test suite + ≥80% coverage | 22 |
| **3** | `layer-3.sh` | Anti-hollow patterns | 23 |
| **4** | `layer-4.sh` | Security audit (bandit + safety) | 24 |
| **5** | `layer-5.sh` | Architecture scores ≥80 | 25 |
| **6** | `layer-6.sh` | Convergence (Δ <2%) | 26 |
| **7** | `layer-7.sh` | Correspondence matrix | 27 |
| **8** | `layer-8.sh` | Completeness manifest | 28 |
| **9** | `layer-9.sh` | Artifact chain | 29 |
| **10** | `layer-10.sh` | Determinism | 30 |

---

## Contract Annotation Format (Layer 1)

```python
import deal

@deal.pre(lambda email: len(email) > 0, message="Email cannot be empty")
@deal.post(lambda result: isinstance(result, str), message="Must return string")
@deal.raises(ValueError, AuthenticationError)
def authenticate(email: str, password: str) -> str:
    """
    Validates user credentials and returns session token

    Args:
        email: User email address
        password: User password

    Returns:
        JWT session token

    Raises:
        ValueError: Invalid email/password format
        AuthenticationError: Invalid credentials
    """
    # implementation
```

**All public functions MUST have deal decorators**

---

## Layer Descriptions

### Layer -1: Self-Validation
- Import all modules (no syntax errors)
- `pytest` (all tests pass)
- **Exit 11** if any fail

### Layer 0: Static Analysis
- `pyright --strict` (strictest type checking)
- **Exit 10** on type errors

### Layer 1: Contract Decorators
- Check all public functions for `@deal.pre/@deal.post/@deal.raises`
- **Exit 21** if missing

### Layer 2: Test Suite
- `pytest --cov --cov-fail-under=80`
- Coverage ≥80%
- **Exit 22** if below threshold or tests fail

### Layer 3: Anti-Hollow Patterns
Detects:
1. Functions with only `pass`
2. Tests without `assert` statements
3. Silent exception handling (`except: pass`)

**Exit 23** if hollow patterns found

### Layer 4: Security Audit
- `bandit -r . -ll` (medium/high severity)
- `safety check --json`
- **Exit 24** on vulnerabilities

### Layer 5: Architecture Scores
6 dimensions (each 0-100):
1. **Coupling**: Import count per file
2. **Cohesion**: Functions per file
3. **Complexity**: Cyclomatic (radon cc)
4. **Error Handling**: try/except coverage
5. **Type Hints**: Annotation coverage
6. **Module Design**: Circular imports

**Composite ≥80**, all dimensions ≥50
**Exit 25** if below threshold

### Layer 6: Convergence
- Compare current architecture scores to baseline
- **Δ must be <2%**
- **Exit 26** if divergence too high

### Layer 7-10: Same as TypeScript module

---

## Usage

**Validate component**:
```bash
cd /home/swarm/TESSARA
bash .outline/outline-strong/validate-component.sh scripts python
```

**Run single layer**:
```bash
bash .outline/outline-strong/modules/python/layer-1.sh scripts
```

---

**Version**: 1.0.0 (Phase 3)
**Last Updated**: 2026-04-05
