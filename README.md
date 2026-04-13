# spec2 — Multi-Language Validation Framework

**Deterministic 12-layer code validation with anti-reward-hacking guarantees.**

Turn your code into production-grade software through automated validation gates that can't be gamed.

---

## Features

✅ **12-Layer Validation** — Self-validation → Static analysis → Contracts → Tests → Anti-hollow → Security → Architecture → Convergence → Correspondence → Completeness → Artifact chain → Determinism

✅ **4 Language Modules** — Go, TypeScript, Python, Shell (44 validation scripts)

✅ **Agent Orchestration** — Spec-first workflow with context isolation

✅ **Unlimited Fix Iteration** — Loops until validation passes (each attempt in fresh context)

✅ **Anti-Reward-Hacking** — Immutable artifacts, one-shot code gen, independent auditing

✅ **100% Deterministic** — All binary go/no-go tests (exit codes)

---

## Quick Start

### Install

```bash
# Clone repository
git clone https://github.com/seattled23/spec2.git
cd spec2

# Install Python dependencies (for MCP server)
pip install -e .

# Install validation tools
bash validation/modules/go/install-tools.sh
bash validation/modules/typescript/install-tools.sh
bash validation/modules/python/install-tools.sh
bash validation/modules/shell/install-tools.sh
```

### Claude Code Skills

```bash
# Install skills (symlink to .claude/skills/)
ln -s $(pwd)/skills/spec2-new ~/.claude/skills/
ln -s $(pwd)/skills/spec2-upgrade ~/.claude/skills/
```

### MCP Server (Optional)

Add to `~/.claude.json`:
```json
{
  "mcpServers": {
    "spec2": {
      "command": "python",
      "args": ["/home/swarm/spec2/mcp-server/server.py"]
    }
  }
}
```

---

## Usage

### Build New Component

```bash
# In Claude Code or Gemini CLI:
/spec2:new "Build analytics dashboard with real-time metrics"
```

Workflow:
1. Generate tier1 spec (system)
2. Generate tier2 specs (subsystems)
3. Generate tier3 specs (components)
4. Generate integration spec
5. Generate validation artifacts
6. Audit artifacts
7. Generate code (one-shot)
8. Validate → Fix loop (unlimited iterations)

### Validate/Upgrade Existing Code

```bash
# In Claude Code or Gemini CLI:
/spec2:upgrade pkg/jcs go
```

Workflow:
1. Detect language automatically
2. Run 12-layer validation
3. Report failures with fix instructions
4. Enter fix loop (if requested)

### Direct Validation

```bash
# Validate component directly
bash validation/validate-component.sh pkg/mycomponent go

# Validate TypeScript
bash validation/validate-component.sh src/components typescript

# Validate Python
bash validation/validate-component.sh scripts python
```

---

## 12 Validation Layers

| Layer | Purpose | Exit Code |
|-------|---------|-----------|
| **-1** | Self-validation (build/import/syntax) | 11 |
| **0** | Static analysis | 10 |
| **1** | Contract annotations | 21 |
| **2** | Test suite + ≥80% coverage | 22 |
| **3** | Anti-hollow patterns | 23 |
| **4** | Security audit | 24 |
| **5** | Architecture scores ≥80 | 25 |
| **6** | Convergence (Δ <2%) | 26 |
| **7** | Correspondence matrix | 27 |
| **8** | Completeness manifest | 28 |
| **9** | Artifact chain | 29 |
| **10** | Determinism | 30 |

**Exit 0 = PASS**, all others = FAIL at specific layer

---

## Language Support

### Go
- Tools: `golangci-lint`, `gosec`, `govulncheck`, `gocyclo`, `staticcheck`
- Contracts: `@pre/@post/@error` annotations in comments

### TypeScript
- Tools: `tsc`, `eslint`, `vitest`, `complexity-report`
- Contracts: TSDoc `@pre/@post/@throws`

### Python
- Tools: `pyright`, `pytest`, `bandit`, `safety`, `deal`, `radon`
- Contracts: `@deal.pre/@deal.post/@deal.raises` decorators

### Shell
- Tools: `shellcheck`, `shfmt`, `bats`
- 8 adapted layers (no contracts/convergence/determinism)

---

## Architecture

### 3-Tier Specification
```
Tier 1: System → Subsystems
Tier 2: Subsystem → Components
Tier 3: Component → Functions (with acceptance criteria)
Integration: Cross-file consistency map
```

### Agent Isolation
```
Tier1 Spec Agent (fresh context)
  ↓
Tier2 Spec Agent (fresh context)
  ↓
Tier3 Spec Agent (fresh context)
  ↓
Integration Spec Agent (fresh context)
  ↓
Artifact Generation Agent (fresh context)
  ↓
Artifact Audit Agent (INDEPENDENT, fresh context)
  ↓
Code Generation Agent (ONE-SHOT, fresh context)
  ↓
Code Fix Agent (UNLIMITED iterations, each in fresh context)
```

### Anti-Reward-Hacking

1. **Context Isolation** — Each agent sees only inputs/outputs, not other agents' reasoning
2. **Immutable Artifacts** — Specs/tests locked after approval, can't adjust to match bad code
3. **One-Shot Code Gen** — Single attempt at generation, no iterative "learning"
4. **Independent Audit** — Artifact auditor never sees generator's context
5. **Fix Iteration** — Each fix in fresh context, prevents gaming validation patterns

---

## Documentation

- **Specification**: `validation/OUTLINE-STRONG-V2-SPEC.md` (61KB design doc)
- **Quick Start**: `validation/QUICK-START.md`
- **Implementation Status**: `validation/IMPLEMENTATION-STATUS.md`
- **Agent Workflows**: `validation/agents/README.md`
- **Language Modules**: `validation/modules/{go,typescript,python,shell}/README.md`

---

## Example: Contract Annotations

### Go
```go
// Canonicalize converts JSON to RFC 8785 JCS format
// @pre: data contains valid JSON bytes
// @post: returns canonicalized bytes OR error
// @error: JSON unmarshal failure, unsupported number format
func Canonicalize(data []byte) ([]byte, error) {
    // ...
}
```

### TypeScript
```typescript
/**
 * Validates user credentials and returns session token
 * @pre email and password are non-empty strings
 * @post returns JWT token OR throws AuthenticationError
 * @throws AuthenticationError - invalid credentials
 */
export async function authenticate(email: string, password: string): Promise<string> {
    // ...
}
```

### Python
```python
import deal

@deal.pre(lambda email: len(email) > 0)
@deal.post(lambda result: isinstance(result, str))
@deal.raises(ValueError, AuthenticationError)
def authenticate(email: str, password: str) -> str:
    """Validates user credentials and returns session token"""
    # ...
```

---

## Contributing

Contributions welcome! See `CONTRIBUTING.md`.

---

## License

MIT License - See `LICENSE`

---

## Credits

Built on Outline-Driven Development principles with deterministic validation gates.

**Author**: seattled23
**Repository**: https://github.com/seattled23/spec2
**Issues**: https://github.com/seattled23/spec2/issues
