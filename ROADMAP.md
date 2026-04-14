# Spec2 Roadmap

**Last updated:** 2026-04-13 (post v1.2.0-dev, +§8/§9/§10 language-packs + quality-tools + review-agents plan)
**Owner:** single source of truth for what's shipped, what's next, what's deferred, and why.

Supersedes scope discussion in: `IMPLEMENTATION_STATUS.md` (status only), `MVP_*` docs (stale),
`PHASE_A_*` docs (superseded). When those conflict with this file, this file wins.

---

## 0. Current state

**Version:** 1.1.0 — shipped 2026-04-13.

Core pipeline is functional end-to-end for a clean run and for resume-from-checkpoint.
All six waves have generator + validator + regeneration loop. Agent isolation
contract is intact: each fresh agent sees only its scoped slice (system spec as
read-only NFR context for Waves 3/4/5/6; parent-tier spec as design target).

**Files to read for orientation:**
- `skills/spec2/orchestrate.ts` — wave functions + `Ctx` + entry points
- `skills/spec2/validators/*` — one per tier + wave-alignment
- `skills/spec2/agents/*` — one per tier + artifact + codegen
- `skills/spec2-resume/resume.ts` — resume dispatcher
- `skills/spec2-status/status.ts` — checkpoint reader
- `CHANGELOG.md` — release history
- `IMPLEMENTATION_STATUS.md` — current status snapshot

---

## 1. Architectural decisions (locked — don't revisit without explicit reason)

### 1.1 Agent isolation contract

Each fresh LLM call receives only what it needs:

| Call site            | Receives                                                        |
|----------------------|-----------------------------------------------------------------|
| Wave 1 generator     | requirements                                                    |
| Wave 1 validator     | requirements + system spec                                      |
| Wave 2 generator     | system spec (parent) + subsystem name                           |
| Wave 2 validator     | system spec + subsystem name + that one subsystem spec          |
| Wave 3 generator     | **system spec (read-only NFR context)** + parent subsystem spec |
| Wave 3 validator     | parent subsystem spec + component name + that one component spec |
| Wave 4 generator     | **system spec (read-only)** + all component specs               |
| Wave 4 validator     | all component specs + integration spec                          |
| Wave 5 generator     | **system spec (read-only)** + component spec + integration spec |
| Wave 5 validator     | component spec + component name + artifacts                     |
| Wave 6 generator     | **system spec (read-only)** + component spec + integration spec + language |
| Wave 6 verifier      | generated code + language (AST-based, no LLM)                   |
| Wave-alignment       | all specs at the wave — only used to catch overlap AFTER generation |

**Invariants:**
- No agent sees sibling specs at the same tier (Wave 3 component A never sees Wave 3 component B during generation).
- The `Ctx` object in `orchestrate.ts` is Node-process-local. It is never serialized into a prompt.
- `SYSTEM CONTEXT` blocks are labeled read-only and explicitly instruct "DO NOT design from this directly."

### 1.2 Dependencies section as the only cross-subsystem channel

Tier 3 component generation cannot see sibling subsystems. The parent
subsystem spec's `Dependencies` section is the ONLY way external contracts
(functions / types / endpoints from other subsystems) reach component designers.
The Tier 2 validator enforces this: handwavy dependencies ("uses LoggingService")
are ERROR-level; the contract surface must be named.

Don't "fix" confused Tier 3 output by widening Tier 3's view to include siblings.
Fix it by tightening the Tier 2 validator and regenerating Tier 2.

### 1.3 Wave alignment is POST-generation

Cross-spec overlap ("two components accidentally implement the same thing") is
caught by `alignSubsystemWave` / `alignComponentWave` running after all specs
at that wave are generated. Pulling that check into the generator would
contaminate design reasoning with sibling context — exactly the reward-hacking
surface we're avoiding.

### 1.4 Checkpoint state is a rehydration format, not a prompt

`.spec2/checkpoints/latest.json` stores orchestrator state so a killed process
can resume. It is loaded into `Ctx` by `ctxFromCheckpoint()` and then waves run
identically to a fresh build. No agent sees the checkpoint file.

### 1.5 Integration Registry is orchestrator-local state (v1.2.0)

`.spec2/registry.db` is a SQLite-backed metadata index of each component's
public surface (function signatures, types, exports, cross-component imports).

**What it is:** An orchestrator-local optimization. It extracts structured data
from validated Tier 3 component specs and stores it in a queryable form.

**What it is NOT:** A prompt artifact. The registry is never serialized into
an LLM prompt. Only `getRegistrySummary()` output enters Tier 4's prompt,
and that output is a curated PUBLIC-SURFACE view:

| Included in summary            | Excluded from summary              |
|--------------------------------|------------------------------------|
| Function signatures + purpose  | Full spec text (verbatim)          |
| Type names + purpose           | parse_warnings, ingested_at        |
| Export/import symbol lists     | Row ids, internal metadata         |
| Cross-component dependency edges | Preconditions, postconditions    |

**Why:** At N components × ~12 pages each, verbatim loading in Tier 4 hits
free-tier rate limits (observed: 413 at 16K tokens on Groq 6K TPM). The
registry summary targets <2K chars for 5 components (~10x reduction).

**Isolation invariant:** The per-agent isolation contract (§1.1) is preserved.
Each component is still designed in isolation (Wave 3 generator never sees
siblings). The registry is populated only AFTER Wave 3 validation passes —
it is a read-only index of already-finalized specs, not a design input.

**Resume behavior:** `ctxFromCheckpoint()` calls `rebuildRegistry()` if the
checkpoint has component specs. If `registry.db` does not exist (e.g., a
v1.1.0 checkpoint), it is rebuilt from the in-memory spec map. Idempotent.

**Location:** `skills/spec2/registry/index.ts`
**Schema tables:** `components`, `functions`, `types`, `exports`, `imports`

---

## 2. What's shipped

### v1.0.0 (2026-04-05)
- 12-layer validation framework (legacy, lives in `validation/`)
- 4-language support (Go, TS, Python, Shell)
- Python MCP server exposing the legacy validator (`mcp-server/server.py`)
- Agent orchestration with context isolation
- Immutable artifacts + one-shot code gen

### v1.1.0 (2026-04-13) — current
- **Wave-based pipeline fully functional** (all 6 waves + regeneration loops)
- **Resume works** (`/spec2-resume` loads checkpoint, dispatches to correct wave)
- **Tier context refinement** (system spec flows as read-only NFR context to Waves 3/4/5/6)
- **Sharpened Tier 2 validator** (rejects underspecified Dependencies)
- **Orchestrator refactor** (wave functions + `Ctx` object, no duplication between fresh/resume)
- **Wave 5/6 resume-safety** (skip already-done components)
- SHA256 spec locking
- Multi-provider LLM with failover (Groq → OpenRouter → Anthropic)
- AST-based anti-hallucination detection
- File persistence + checkpoint system
- `/spec2-status` command

### v1.2.0-dev (current, 2026-04-13)
- **MCP server wrapper** (`skills/spec2-mcp/`) — all tools async/job-based
- **HTTP API** (`skills/spec2-api/`) — Fastify, same job tracking
- **Anti-hollow test detection** (`skills/spec2/verification/anti-hollow.ts`) — AST-based for TS/JS, regex for Python; 47-check test suite
- **Integration Registry** (`skills/spec2/registry/`) — SQLite-backed component metadata index; Wave 3 populates it after validation; Tier 4 queries `getRegistrySummary()` instead of loading full specs verbatim; isolation contract preserved (§1.5). 70-check test suite.

---

## 3. Scope for next work — prioritized buckets

Effort estimates assume focused work without context-switching. Value and risk
are judged against spec2's core value prop: "requirements-to-code with quality
that doesn't require babysitting."

### Tier 1 — **Do next**. High value, clear scope, low risk.

| # | Item                                  | Effort | Value  | Why do it                                                                 |
|---|---------------------------------------|--------|--------|---------------------------------------------------------------------------|
| ~~A~~ | ~~MCP server wrapper~~            | ~~3h~~ | —      | ✅ **shipped in v1.2.0-dev** — `skills/spec2-mcp/`. Also added `skills/spec2-api/` (HTTP transport) since both share the same core. |
| ~~B~~ | ~~Anti-hollow test detection~~    | ~~4h~~ | —      | ✅ **shipped in v1.2.0-dev** — `skills/spec2/verification/anti-hollow.ts`. AST-based for TS/JS, regex heuristics for Python. 47-check unit test suite verifies every rule fires correctly. Exposed via `spec2_check_tests` (MCP) and `POST /check-tests` (HTTP). |
| ~~C~~ | ~~Integration Registry (SQLite)~~ | ~~6h~~ | —      | ✅ **shipped in v1.2.0-dev** — `skills/spec2/registry/`. SQLite via `better-sqlite3`. Wave 3 populates registry after validation; Tier 4 queries `getRegistrySummary()` (<2K chars) instead of full specs verbatim. Fallback to disk if registry unavailable. 70-check test suite. See ROADMAP §1.5. |
| ~~D~~ | ~~Documentation pass~~             | ~~2h~~ | —      | ✅ **shipped in v1.2.0-dev** — 14 stale docs archived to `docs/archive/` (not deleted). New README.md (8.5 KB) accurate to v1.2.0. Two dead-code paths removed (fake integration-test log, auto-approve placeholder). Broken `2spektd-new` symlink deleted. |

**Tier 1: ALL COMPLETE** (A, B, C, D shipped in v1.2.0-dev).

**Resolved design decisions (from A):**
- **Execution model:** async/job-based on BOTH transports. Build/resume return `{jobId}` immediately; clients poll. Same job tracking in `skills/spec2/utils/jobs.ts` — shared by MCP and HTTP.
- **Two transports from one core:** `skills/spec2-mcp/` (stdio MCP) + `skills/spec2-api/` (Fastify HTTP) both import `../spec2/dist/orchestrate.js` + `../spec2/dist/utils/jobs.js`. No logic duplication.
- **HTTP enables automated E2E testing** — tier-1 blocker (K) is now unblockable as soon as API quota is available: scripts can POST to `/builds` and poll `/jobs/:id` without needing Claude Code.

### Tier 2 — **Defer**. Medium value, not blocking, larger scope.

| # | Item                                  | Effort | Value  | Why defer                                                                 |
|---|---------------------------------------|--------|--------|---------------------------------------------------------------------------|
| ~~E~~ | ~~Visual Review Package~~ (#4)    | ~~8h~~ | —      | ✅ **shipped in v1.2.0-dev** — `skills/spec2/review/`. Deterministic (no LLM) extractors for each tier; markdown with embedded Mermaid diagrams. Hooked into orchestrate.ts at each wave's post-validation point. Review failures are non-fatal. 58-check unit suite + LLM-import regression guard. |
| F | **Confidence scoring & routing** (#7) | 4h     | Medium | Per-spec confidence 0-100 to decide whether to auto-accept or ask for review. Requires calibration data we don't have yet. Risk of false confidence. |
| G | **`/spec2-init-existing`** (#20)      | 8h+    | Low    | Reverse-engineer specs from existing code. Untested design space. Niche use case. |
| H | **Automated alignment conflict resolution** (#26) | 6-8h | Medium | Currently `alignSubsystemWave` / `alignComponentWave` throw on any conflict. An LLM-assisted resolver could suggest patches and either apply them (with §1.3 post-generation isolation preserved) or emit a patch-proposal artifact for human review. See §1.3 constraints below. |

**H — Design constraints (do NOT violate when implementing):**

- **Preserve §1.3 invariant**: wave-alignment detection is post-generation and runs
  with cross-spec visibility. That is intentional — pulling alignment back into the
  generator would contaminate design reasoning with sibling context. A resolver that
  *regenerates* a spec with sibling context bleeds reward-hacking surface. Safe
  approach: a fresh agent receives only (conflicting spec, conflict description,
  suggested patch) and emits a localized edit. Spec-level generation stays isolated.
- **Two output modes** — decide in design: (a) auto-apply resolution + re-validate
  (minimum 1 extra regeneration round, costs LLM budget); (b) emit `.spec2/review/alignment-conflicts.md`
  as a human-facing patch proposal and still throw. Mode (b) is safer and fits
  the existing "review package" pattern.
- **Limit blast radius**: only conflicts whose "suggestion" field is deterministic
  enough should auto-apply. Anything ambiguous stays human-gated. Wave-alignment's
  own confidence in its suggestion (not present today) would need to be added.
- **Idempotency**: re-running a resolved conflict must not re-flag it — otherwise
  resume loops will bounce forever.
- **Test plan**: synthetic conflict fixtures + assertion that (a) auto-apply mode
  produces a spec whose re-run passes alignment; (b) proposal mode writes a
  well-formed markdown artifact and still throws the original error.

### Tier 3 — **Defer**. External dependencies, risk of maintenance burden.

| # | Item                                  | Effort | Value  | Why defer                                                                 |
|---|---------------------------------------|--------|--------|---------------------------------------------------------------------------|
| I | **Mutation testing** (#8)             | 4h     | Medium | Stryker (JS/TS) / mutmut (Python) / PITest (Java) per-language install. Flaky on CI. Defer until Tier 1 stable. |
| ~~J~~ | ~~Code quality tools (#9)~~       | —      | —      | **Promoted to §9 as top-priority workstream** — language adapters land in §8, tool integration in §9. Original entry misjudged value; see §9 for revised rationale. |

### Blocked

| # | Item                                  | Blocker                                                                 |
|---|---------------------------------------|--------------------------------------------------------------------------|
| K | **E2E validation test** (#19)         | Needs LLM API keys with headroom beyond free-tier rate limits. Groq free tier rejects 16K-token prompts (observed during v1.1 smoke test: `413 Request too large ... Limit 6000, Requested 16299`). Solutions: (1) upgrade Groq to Dev tier, (2) budget OpenRouter/Anthropic spend for full test, (3) build a mock LLM harness for CI and run live tests opportunistically. Not a code bug — environmental. |

---

## 4. Known issues / debt

- ~~**Legacy MVP/PHASE_A docs**~~ — ✅ archived to `docs/archive/` in v1.2.0-dev.
- ~~**Broken `2spektd-new` symlink**~~ — ✅ deleted in v1.2.0-dev.
- ~~**Broken `spec2-legacy/2spektd-upgrade` symlink**~~ — ✅ deleted in v1.2.0-dev debt sweep.
- ~~**MVP auto-approve log in Tier 3**~~ — ✅ removed in v1.2.0-dev.
- ~~**Wave 6 fake integration-test log**~~ — ✅ removed in v1.2.0-dev.
- ~~**Single-writer-per-process (concurrent-job log corruption)**~~ — ✅ fixed in v1.2.0-dev via `AsyncLocalStorage`-based per-job routing. 29-check concurrency test guards the regression. Flagged previously in `spec2-mcp/TESTING.md`.
- ~~**Rust in language enum, never tested**~~ — ✅ pruned in v1.2.0-dev. Rust re-adds as §8 Pack #5.
- ~~**Java in language enum, no project usage**~~ — ✅ pruned 2026-04-13 (language survey: 0 Java projects). Re-adds as §8 Pack #7 when usage appears.
- ~~**node_modules tracked in git**~~ — ✅ untracked 2026-04-13 via `git rm -r --cached skills/spec2/node_modules` (3,746 files). .gitignore already excluded for new tracking.
- **Legacy v1.0 12-layer path still in repo** — `validation/*.md` and `mcp-server/server.py` describe the shipped-but-superseded 12-layer framework. Annotated with LEGACY headers pointing to current architecture. Full deprecation candidate for v1.3.0.
- **`validation/*.md` docs annotated, not archived** — rationale: code under `validation/` is still imported by `mcp-server/server.py`. Archiving docs without removing code would strand the legacy path. Decision deferred.

---

## 5. Design questions still open

Not blocking, but will need answers before the related work:

1. **MCP tool naming** — `spec2_build` vs `spec2_new` (matches slash command). Pick before shipping.
2. **Resume concurrency** — if two processes call `spec2_resume` simultaneously, latest.json races. Add file lock? For now document as single-writer.
3. ~~**Language support beyond 5** — currently `python | typescript | javascript | go | java | rust`.~~ ✅ resolved 2026-04-13. Current supported enum: `python | typescript | javascript | go`. Language expansion is now a tracked workstream — see §8 Language Packs.
4. **Artifact storage on resume** — if a user manually edits an artifact between interruption and resume, should resume re-validate? Currently skipped. Probably fine but document.
5. **What "complete" means** — `phase: 'complete'` blocks resume. Should there be a `/spec2-extend` command to add components to a complete project without starting over?

---

## 6. Release candidates

### v1.2.0 target
Ships Tier 1 (MCP + anti-hollow + registry + docs). After this, spec2 is usable
from Claude Code and Gemini CLI natively, and the "anti-hollow testing" claim in
the README is actually backed by code.

### v1.3.0 target (updated 2026-04-13 — supersedes prior v1.3.0 scope)
Ships §8 Pack #1 (Go) + §9.5-P1/P2 (Go pack adapters + semgrep + trivy multi-lang).
Spec2 goes from "claims 4-language support with 3 stubs" to "Go is a real
supported pack with full validation parity." Completion test: the `§8.0 current gap`
table has all four columns filled in for Go.

**Deferred from original v1.3.0 scope**: Visual Review Packages already shipped in
v1.2.0-dev; confidence scoring (Tier 2 F) moves to v1.4.0.

### v1.3.1 / v1.3.2 / v1.4.0 (sketched)
- **v1.3.1**: Astro + Python packs (§9.5-P3 + P4), TS/JS adapter upgrade (P5),
  §10 ReviewAgent foundation (P1) + highest-value agents (P2).
- **v1.3.2**: Rust pack (§9.5-P6), remaining review agents (§10.7-P3/P4/P5).
- **v1.4.0**: C/C++/Java/Shell/Dockerfile (P7), shared-package extraction (P8),
  confidence scoring (Tier 2 F), optional multi-tier LLM orchestration.

### v2.0.0 target
Blocked on E2E validation proving the pipeline produces production-quality code
on a non-trivial system (say, a 10-component service with real integration tests).
Can't declare "production" without this. §8/§9 work raises the *floor* of what
"production-quality" means per language but does not change v2.0's blocker (K).

---

## 7. Process notes

- When adding a new item here, include **effort, value, risk, and why**. Items without justification get cut.
- When completing an item, move it to `## 2 What's shipped` and strike it from Tier N with a line pointer: `✅ shipped in v1.X.Y`.
- Don't add items that duplicate existing code. If a thing exists and needs polish, say "polish existing X" with a file path.
- "Done" means: code written, type-checks clean, at least a smoke test run, docs updated, CHANGELOG entry written. Not "code exists and probably works."

---

## 8. Language Packs

### 8.0 Motivation & current gap

Today spec2 advertises 4 languages (`python | typescript | javascript | go`) in its
MCP/HTTP schema but ships asymmetric quality support:

| Pack target | Codegen prompt | Anti-hallucination | Anti-hollow tests | Quality tools |
|-------------|----------------|---------------------|---------------------|---------------|
| TypeScript  | generic LLM prompt | AST (real, `@babel/parser`) | AST (real) | none wired in |
| JavaScript  | generic LLM prompt | AST (real, `@babel/parser`) | AST (real) | none wired in |
| Python      | generic LLM prompt | **stub `passed:true`** | regex heuristics | none wired in |
| Go          | generic LLM prompt | **stub `passed:true`** | **unsupported** | none wired in |

See `skills/spec2/verification/anti-hallucination.ts:29` and
`skills/spec2/verification/anti-hollow.ts:25-27` for the explicit stubs.

Target: each supported language should receive equivalent validation depth,
so spec2's quality guarantee does not degrade based on the user's `language` arg.

### 8.1 Architecture: `LanguagePack` manifest

Each pack is a declarative manifest plus optional native code. Common contract:

```ts
interface LanguagePack {
  id: string;                         // 'go', 'python', 'astro', ...
  extensions: string[];               // ['.go'] — replaces orchestrate.ts getExtension map
  codegenPromptTemplate: string;      // language-specific idioms, test framework, linter rules
  testFilePattern: RegExp;            // *_test.go | test_*.py | *.test.ts
  hallucinationDetector?: (code: string) => Promise<HallucinationReport>;
  hollowTestDetector?: (code: string) => Promise<HollowReport>;
  qualityTools: QualityToolRef[];     // references to tools in §9 registry
}
```

Runtime: `orchestrate.ts` resolves the pack from the `language` arg, passes
`codegenPromptTemplate` into Wave 6 codegen, runs `hallucinationDetector` and
`hollowTestDetector` post-generation, then runs each `qualityTools` entry via
the shared runner (§9). Fallbacks (missing detector → `{supported:false, passed:true}`)
are preserved for backward compatibility but flagged in the build report as
"partial coverage — pack N.M".

### 8.2 Pack priority order (user-specified 2026-04-13)

| Pack # | Language    | Priority  | Effort | Rationale |
|--------|-------------|-----------|--------|-----------|
| 1      | Go          | **Now**   | 6-8h   | 95K LOC across 6 projects (user's dominant language); currently zero real validation. Biggest quality delta. |
| 2      | Astro       | Next      | 4-6h   | 17.5K LOC across tessara-website. Unique: compiles to TS+HTML, needs multi-target validation. `astro check` is the anchor tool. |
| 3      | Python      | After     | 4-6h   | 36K LOC across 11 projects. Current regex-hollow detector gets upgraded to AST (via native Python subprocess or tree-sitter-python). |
| 4      | TypeScript / JavaScript | After | 3-4h | Already has detectors; this pack *adds the quality-tool layer* (biome / eslint / tsc). Low risk — no detector rework. |
| 5      | Rust        | After     | 5-7h   | Previously pruned from enum; re-add with real validation via clippy + syn-based AST parsing or tree-sitter-rust. |
| 6      | C / C++     | Later     | 6-8h   | 15.7K C header LOC shows signal (llama.cpp / inference work). clang-tidy is the anchor. |
| 7      | Java        | Later     | 5-7h   | Re-added when usage appears. errorprone + checkstyle + pmd are the candidates. |
| 8      | Shell       | Opportunistic | 2h | Shellcheck alone gets most of the value; trivial pack. |
| 9      | Dockerfile  | Opportunistic | 2h | Hadolint alone. Not a "language" in the codegen sense, but useful for infra specs. |
| 10     | Kotlin, Ruby, PHP, Terraform, Cython | Later | — | Only via semgrep/trivy (multi-lang coverage). Full packs only when project usage justifies. |

**Packs target: full parity across all listed languages eventually.** No pack
ships as "stub returns true" — that was the v1.0/1.1/1.2 compromise we are
explicitly reversing.

### 8.3 Architectural constraints (locked — apply to every pack)

- **No pack may silently pass** on an unsupported operation. Missing detector →
  explicit `{supported: false}` in report, surfaced to the user.
- **Each pack ships with a test fixture directory** — real-world-shaped code
  samples that exercise every detector rule. Reuse the v1.2.0 47-check anti-hollow
  pattern (see `skills/spec2/verification/anti-hollow.test.mjs`).
- **Packs are file-scoped**, not project-scoped. Each runs against a single
  generated component's code, matching Wave 6's isolation contract (§1.1).
- **AST-parser choice per pack is pragmatic, not dogmatic.** Go pack can use
  tree-sitter-go (JS-callable) OR shell out to `go/parser` via a small helper
  binary. Rule of thumb: prefer the approach that also lets CompanyOS2 reuse
  the detector (§9.4 reuse plan).

### 8.4 Pack 1 — Go (detailed spec)

**Codegen prompt additions** (into `codegen.ts` language-specific block):
- Use `go/ast`-compatible idioms (explicit error returns, no panics in library code).
- Test file naming: `<file>_test.go`; test framework: stdlib `testing.T`.
- Import grouping convention (stdlib / external / internal).
- Error wrapping with `fmt.Errorf("...: %w", err)`.

**Hallucination detector** — Go-aware import validation:
- Parse via tree-sitter-go (npm: `tree-sitter-go` + `tree-sitter`).
- Extract `import` block; validate each path against:
  - stdlib allowlist (hardcoded subset from `go list std`);
  - `go.sum` presence check if an `outputPath` has one;
  - obvious hallucination patterns (`fake-*`, `mock-*` except `mock` tests, `generated-*`).
- Return `{passed, invalidImports, hallucinationRate}` in the existing shape.

**Hollow-test detector** — Go test body analysis:
- Match functions named `Test*(t *testing.T)`.
- Flag: zero calls to `t.Error*`, `t.Fatal*`, `t.Log*`-only bodies, tautological
  patterns (`if true { ... }`, `t.Fail()` without preceding assertion).
- Same severity model as anti-hollow.ts.

**Quality tools wired in** (see §9 for runner details):
- `golangci-lint run --out-format json` (meta-linter, bundles ~50 linters including govet + staticcheck).
- `go vet ./...` (quick sanity pass; overlaps golangci-lint but runs faster).
- `gosec -fmt json ./...` (security).
- `gofmt -l` (format drift detection; listing-mode only, doesn't modify).

**Ship gates:**
- Test fixture with >=10 samples: valid Go, hallucinated imports (3+ variants),
  hollow tests (5+ pattern variants), low assertion density.
- Go pack passes anti-hallucination + anti-hollow on all fixtures deterministically.
- `golangci-lint` integration runs in CI, returns structured issues.
- Smoke test: Wave 6 end-to-end with `language: 'go'` produces code that passes
  all four Go quality tools.

### 8.5 Future packs — preliminary tooling anchors

| Pack | AST parser | Primary quality tools | Test framework |
|------|-----------|------------------------|----------------|
| Astro | `astro check`-driven (no AST detector yet) | `astro check`, `eslint`, `tsc` (for component scripts) | Vitest |
| Python | tree-sitter-python OR subprocess to `ast` module | `ruff`, `pyright`, `bandit`, `vulture`, `radon` | pytest / hypothesis |
| TS/JS | existing @babel/parser (reuse) | `biome` (lint+format), `tsc --noEmit`, `eslint-plugin-security` | vitest / jest |
| Rust | tree-sitter-rust OR `syn` via helper | `clippy`, `cargo-audit`, `cargo-deny` | `cargo test` |
| C/C++ | tree-sitter-c / -cpp | `clang-tidy`, `cppcheck` | ctest / gtest |
| Java | tree-sitter-java | `checkstyle`, `errorprone`, `spotbugs` | JUnit |
| Shell | N/A (regex) | `shellcheck` | bats |
| Dockerfile | N/A | `hadolint` | N/A |

### 8.6 Pack manifest directory structure (target)

```
skills/spec2/packs/
  go/
    manifest.ts           # implements LanguagePack interface
    codegen-prompt.md     # idioms + test framework + linter rules, imported as string
    hallucination.ts      # Go-specific import validator
    hollow-tests.ts       # Go test body analyzer
    fixtures/             # test inputs
      valid-service.go
      hallucinated-imports.go
      hollow-tests.go
    manifest.test.mjs     # deterministic detector tests
  python/...
  astro/...
  ...
skills/spec2/packs/index.ts   # pack registry, loaded by orchestrate.ts
```

---

## 9. Quality Tools Integration

### 9.1 Prior art: CompanyOS2 has solved this already

**Before building a quality-tool runner in spec2, we reuse CompanyOS2's work.**

CompanyOS2 ships a production-ready multi-language static-analysis layer:

- `companyos/services/analysis_registry.py` (179 lines) — `AnalysisTool` dataclass
  + registry of 12 tools across 13 languages + `shutil.which()`-based availability checks.
- `companyos/background/tasks/tech_debt.py` (1130 lines) — 12 runner functions:
  `_run_ruff_analysis`, `_run_complexity_analysis`, `_run_bandit_analysis`,
  `_run_semgrep_analysis`, `_run_vulture_analysis`, `_run_wily_analysis`,
  `_run_golangci_lint`, `_run_cargo_clippy`, `_run_oxlint`, `_run_shellcheck`,
  `_run_hadolint`, `_run_trivy_fs`.
- Normalized issue dict: `{type, severity, file, line, rule, message, detected_at}`.
- Tests: `tests/test_multilang_analysis.py`.

That's the exact inventory spec2 needs. Rebuilding would be wasted work.

### 9.2 Reuse strategy (decision: port, then share)

Three candidate approaches evaluated:

| Option | Description | Trade-off |
|--------|-------------|-----------|
| (a) Spec2 shells out to a Python CLI exposed by CompanyOS2 | Tight coupling; spec2 becomes a non-standalone skill. **Rejected.** |
| (b) Port runners to TS in spec2, using CompanyOS2 as reference spec | Low coupling; ~300-500 LOC of TS per tool family. Accepts duplication. **Chosen for v1.3.0.** |
| (c) Extract runners to a polyglot package both projects import | Cleanest long-term; highest upfront cost. **Planned for v1.4.0** once both projects have stabilized on the shape. |

**v1.3.0 workstream**: port CompanyOS2's proven tool list + args + severity mapping
into a TS-native `QualityToolRunner`. Keep the JSON issue shape byte-compatible
with CompanyOS2's so (c) is cheap later.

### 9.3 `QualityToolRunner` interface (target)

```ts
interface QualityToolAdapter {
  id: string;                   // 'golangci-lint', 'ruff', 'biome', ...
  languages: string[];          // language ids this adapter covers
  toolType: 'lint' | 'security' | 'dead_code' | 'complexity' | 'sast' | 'format';
  detect(): Promise<boolean>;   // shutil.which() analogue — is tool installed?
  run(args: {
    code: string;
    path: string;               // tempfile written by runner or existing file
    cwd?: string;
  }): Promise<QualityIssue[]>;
  install?: string;             // hint: "pip install ruff" for missing-tool messages
}

interface QualityIssue {
  tool: string;
  type: 'lint' | 'security' | 'dead_code' | 'complexity' | 'sast';
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  column?: number;
  rule?: string;
  message: string;
  fixable?: boolean;
  detectedAt: string;           // ISO8601
}
```

**Runtime integration**: `codegen.ts` calls `runQualityTools(pack, generatedCode, outputPath)`
after `detectHallucinations`, before returning success. Aggregated issues go into
`.spec2/review/quality-<tier>.md` alongside the visual review package.

### 9.4 Tool adapter inventory (port targets, by pack)

| Pack | Adapters to port from CompanyOS2 | New adapters | Cross-pack (multi-language) |
|------|----------------------------------|--------------|------------------------------|
| Go (#1) | golangci-lint | go vet, gosec, gofmt | semgrep, trivy |
| Astro (#2) | — | astro check, biome | semgrep |
| Python (#3) | ruff, bandit, vulture, radon, wily | pyright | semgrep, trivy |
| TS/JS (#4) | oxlint | biome, tsc, eslint-plugin-security | semgrep, trivy |
| Rust (#5) | cargo-clippy | cargo-audit, cargo-deny, rustfmt | semgrep, trivy |
| C/C++ (#6) | — | clang-tidy, cppcheck, clang-format | semgrep |
| Java (#7) | — | checkstyle, errorprone, spotbugs | semgrep, trivy |
| Shell (#8) | shellcheck | — | — |
| Dockerfile (#9) | hadolint | — | trivy |

**semgrep + trivy** are single adapters serving multiple packs (multi-language
SAST / vulnerability scanning). Port them once in §9.5 Phase 2.

### 9.5 Delivery phasing

| Phase | Scope | Effort | Targets |
|-------|-------|--------|---------|
| 9.5-P1 | `QualityToolRunner` abstraction + Go pack adapters (golangci-lint, go vet, gosec, gofmt) | 6-8h | v1.3.0 entry |
| 9.5-P2 | Semgrep + Trivy multi-lang adapters (plug into all packs that list them) | 3-4h | v1.3.0 |
| 9.5-P3 | Astro pack adapters (astro check, biome) | 3-4h | v1.3.0 or v1.3.1 |
| 9.5-P4 | Python pack adapters (ruff, bandit, vulture, radon, wily, pyright) | 4-5h | v1.3.1 |
| 9.5-P5 | TS/JS pack adapters (biome, tsc, oxlint port, eslint-plugin-security) | 3-4h | v1.3.1 |
| 9.5-P6 | Rust pack adapters (clippy, cargo-audit, cargo-deny) | 4-5h | v1.3.2 |
| 9.5-P7 | C/C++, Java, Shell, Dockerfile adapters | 6-8h | v1.4.0 |
| 9.5-P8 | Shared-package extraction (option (c) in §9.2) | 8-12h | v1.4.0 |

### 9.6 Ship gate per adapter

- Binary detection via `detect()` returns false cleanly when tool missing; no crashes.
- Normalized JSON output matches `QualityIssue` interface (verified by schema test).
- `install` hint string matches the official installation command for the tool.
- Adapter has a unit test that runs against a known-bad fixture and asserts
  expected issues are reported (anti-tautological).
- Adapter has a unit test that runs against a known-good fixture and asserts
  zero issues.
- Timeouts: every subprocess call has a hard timeout (default 60s), returns empty
  on timeout, logs a warning.

### 9.7 Design constraints (locked)

- **Tool-missing is non-fatal.** If a pack lists an adapter whose binary isn't
  installed, the adapter logs "missing, skipping" and the build continues. The
  final report lists missing tools so the user can install them.
- **No in-repo vendoring of linter binaries.** Install via the tool's official
  package manager (go install, pip, npm, cargo, brew). Document per-tool install
  in pack README.
- **Adapter output never mutates the user's code.** Format-only adapters (gofmt,
  biome format) run in check/listing mode. Spec2 reports drift; doesn't fix.
- **Severity mapping mirrors CompanyOS2's for forward compatibility.** When in
  doubt, match what `_map_ruff_severity` / equivalent does in
  `companyos/background/tasks/tech_debt.py`.

---

## 10. Review Agents (ported from OpenSpec/Goodvibes lineage)

### 10.1 Lineage context

Spec2's predecessors — OpenSpec (original) → Goodvibes (V2 upgrade) — shipped a
review-agent layer that spec2 never re-implemented. This section ports the parts
worth keeping.

**Source of truth:** `/home/swarm/goodvibes/legacy_openspec/review/agents/`
(2,082 LOC of Go) + `/home/swarm/goodvibes/openspec/review-agents/*.instructions.md`
(7 LLM prompt files).

### 10.2 Why these are a gap, not a duplicate

Spec2's current `skills/spec2/validators/*` layer checks **per-tier-internal**
structure — "is the subsystem spec well-formed?". The review agents check
**cross-cutting quality dimensions** — "does the architecture hold together?
are capabilities covered?". Orthogonal axes. Both needed.

### 10.3 Six review dimensions to port

| Agent id | Purpose | Goodvibes source | Spec2 slot point |
|----------|---------|------------------|-------------------|
| `architecture_validation` | Design decisions documented, components cohere, scalability/operational viability identified | `architecture_validation.go` (370 LOC) | Post-Wave 1 (System) |
| `requirements_completeness` | EARS notation, scenario completeness, testability | `requirements_completeness.go` (299 LOC) | Post-Wave 0 (requirements) or pre-Wave 1 |
| `capability_coverage` | Every claimed capability maps to a component | `capability_coverage.go` (301 LOC) | Post-Wave 3 (Component) |
| `integration_points` | External contracts documented, cross-component interfaces defined | `integration_points.go` (367 LOC) | Post-Wave 4 (Integration) |
| `gap_analysis` | Proposal/design/specs/tasks/CI completeness across 5 dimensions | `gap_analysis.go` (326 LOC) | End-of-pipeline (pre-finalize) |
| `user_experience` | User journey coverage, error states, accessibility | `user_experience.go` (419 LOC) | Post-Wave 1 (System, when user-facing) |

### 10.4 Architecture: `ReviewAgent` interface

```ts
interface ReviewAgent {
  id: string;                         // 'architecture_validation', ...
  description: string;
  instructionFile: string;            // path to .instructions.md prompt
  slot: 'post-wave-0' | 'post-wave-1' | 'post-wave-3' | 'post-wave-4' | 'pre-finalize';
  review(ctx: {
    specs: Record<string, string>;    // tier -> markdown content
    changeId?: string;                // optional scoping (goodvibes compat)
  }): Promise<ReviewReport>;
}

interface ReviewReport {
  agentId: string;
  findings: Finding[];
  summary: string;
  score: number;                      // 0-100, goodvibes uses 80 as default threshold
}

interface Finding {
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  location: string;                   // spec section / line range
  recommendation: string;
}
```

**Orchestration:** a `ReviewOrchestrator` analogous to goodvibes's
`legacy_openspec/review/orchestrator.go` — parallel agent execution, content-hash
caching, threshold-based approval (default 80), recursive review loops optional.

### 10.5 Direct-reuse assets (zero-port cost)

The 7 instruction files in `goodvibes/openspec/review-agents/*.instructions.md`
are LLM prompts. They copy verbatim into `skills/spec2/review-agents/prompts/`.
No rewrite needed — only path adjustments.

| Instruction file | Purpose |
|------------------|---------|
| `architecture-validation.instructions.md` | Architecture review prompt |
| `capability-coverage.instructions.md` | Capability coverage prompt |
| `gap-analysis.instructions.md` | Gap analysis prompt |
| `gaps-analysis.instructions.md` | (duplicate naming — investigate which is canonical before port) |
| `integration-points.instructions.md` | Integration points prompt |
| `requirements-completeness.instructions.md` | Requirements completeness prompt |
| `user-experience.instructions.md` | UX review prompt |

### 10.6 What to NOT port from the lineage

| Concept | Rationale for skipping |
|---------|-----------------------|
| Atomic file-level task decomposition | Spec2's Wave 6 is already per-component; finer granularity is a future concern. |
| Multi-tier agent orchestration (Opus/Sonnet/Haiku/Gemini assignment) | Cost optimization, not quality driver. Defer to v1.4.0+ if budget dictates. |
| Resynthesis Protocol | Only matters if atomic decomposition adopted. Wave alignment §1.3 covers the current need. |
| Goodvibes `pkg/ssot` schema | Integration Registry §1.5 is the narrower, better-fit version. |
| Goodvibes `pkg/orchestration` engine | Spec2 has its own (`orchestrate.ts`), better-tested (29 concurrency checks green). |
| `ContextPackage` struct | Superseded by Agent Isolation Contract §1.1 (formally specified, not ad-hoc). |

### 10.7 Delivery phasing

| Phase | Scope | Effort | Target |
|-------|-------|--------|--------|
| 10.7-P1 | `ReviewAgent` interface + `ReviewOrchestrator` (parallel exec, caching, threshold) | 3-4h | v1.3.x entry |
| 10.7-P2 | Port `requirements_completeness` + `architecture_validation` (highest-value, post-Wave 0/1 slots) | 3-4h | v1.3.x |
| 10.7-P3 | Port `capability_coverage` + `integration_points` (mid-pipeline) | 3-4h | v1.3.x |
| 10.7-P4 | Port `gap_analysis` + `user_experience` (end-of-pipeline) | 3-4h | v1.3.x |
| 10.7-P5 | Wire all 6 agents into orchestrate.ts slot points + smoke test on existing Wave 1-6 output | 2-3h | v1.3.x |

**Estimated total effort:** 14-18h across 5 phases, matching 1-2 focused days.
Cheaper than the Go code's 2,082 LOC suggests because goodvibes's Go
implementation is boilerplate-heavy; the review logic is thin (markdown read →
regex/heuristic match → emit Finding).

### 10.8 Sequencing relative to §8/§9

Review agents and language packs are **orthogonal workstreams** — they slot
into Wave 6 at different points (review agents validate specs; packs validate
generated code). Recommended sequencing:

1. Complete §8 Pack #1 (Go) + §9.5-P1/P2 — v1.3.0 entry.
2. Start §10 in parallel with §8 Pack #2 (Astro) — review agents don't block
   pack work; packs don't block review agents.
3. Both workstreams converge at v1.3.x with end-to-end: spec2 generates → review
   agents validate specs at each tier → language pack validates generated code.

### 10.9 Ship gates

- All 6 agents return deterministic `ReviewReport` on a frozen fixture (no LLM
  non-determinism — findings are regex/structure-based per goodvibes's Go code).
- Threshold-based approval: score ≥80 passes, <80 emits a `.spec2/review/agent-<id>.md`
  patch proposal (mirrors §8.3 "no pack may silently pass" constraint).
- Agent failures are non-fatal: review continues, agent flagged as "errored" in
  the final report.
- Smoke test: run all 6 agents against a known-good v1.1.0+ build output
  (integration test artifact) and assert all pass.

