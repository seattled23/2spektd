# Spec2 Roadmap

**Last updated:** 2026-04-14 (v1.3.0-dev — §8 Pack #1 Go shipped + §11 Production-Grade Quality Pipeline architecture captured)
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

### v1.2.0-dev (2026-04-13)
- **MCP server wrapper** (`skills/spec2-mcp/`) — all tools async/job-based
- **HTTP API** (`skills/spec2-api/`) — Fastify, same job tracking
- **Anti-hollow test detection** (`skills/spec2/verification/anti-hollow.ts`) — AST-based for TS/JS, regex for Python; 47-check test suite
- **Integration Registry** (`skills/spec2/registry/`) — SQLite-backed component metadata index; Wave 3 populates it after validation; Tier 4 queries `getRegistrySummary()` instead of loading full specs verbatim; isolation contract preserved (§1.5). 70-check test suite.

### v1.3.0-dev (current, 2026-04-14)
- **§8 Pack #1 — Go LanguagePack** (`skills/spec2/packs/go/`) — codegen prompt,
  hallucination detector (regex + Go-stdlib allowlist + suspicious-pattern
  catch), hollow-test detector (brace-aware Go-test-body scanner with
  assertion/mock counting). Go moves from "detector stub returning true" to
  first-class pack. 48-check test suite (`packs/go/manifest.test.mjs`).
- **§8.1 LanguagePack registry** (`skills/spec2/packs/index.ts`) — pluggable
  pack interface with pack-aware dispatch from anti-hallucination.ts,
  anti-hollow.ts, codegen.ts, orchestrate.ts/persist.ts (`getExtension`).
- **§9.3 QualityToolAdapter interface** (`skills/spec2/quality/adapter.ts`) —
  subprocess-backed runner with hard timeouts, non-fatal missing-tool handling,
  normalized `QualityIssue` shape byte-compatible with CompanyOS2's
  `tech_debt.py` dict. `runAll()` batches adapters against a single file.
- **§9.5-P1 Go quality adapters** (`skills/spec2/quality/adapters/go/`) —
  gofmt (format drift), go vet (lint), golangci-lint (meta-linter JSON output),
  gosec (security, HIGH/MEDIUM/LOW severity mapping). All 4 smoke-tested
  against real binaries. Auto-materialize temp `go.mod` sandbox for adapters
  that require module context.
- **Architectural decision**: AST parsing for Go uses regex + `go vet`
  subprocess instead of tree-sitter-go. Rationale: Go toolchain is already a
  hard dependency for the quality adapters, so shelling to `go vet` gives
  compiler-grade semantic validation with zero new npm deps. Supersedes the
  §8.4 "tree-sitter-go OR shell to go/parser" open question.

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

### v1.3.0 target (updated 2026-04-14 — adds §11 quality-pipeline foundation)
Ships:
- §8 Pack #1 (Go) ✅ — landed 2026-04-14, commit 6b0ddf6.
- §9.5-P1 ✅ — landed with Pack #1.
- §9.5-P2 (semgrep + trivy multi-lang adapters).
- §11 quality-pipeline foundation: §11.5-P1 (correctness gate makes
  ERROR-severity findings fatal in Wave 6.1), §11.5-P2 (test gen/run +
  itemized failures + anti-hollow gate as Wave 6.2), §11.5-P7 (itemized
  regen prompt shape across all sub-waves), §11.5-P8 (severity routing
  dispatcher).

Spec2 goes from "single-pass with non-fatal warnings" → "ERROR-severity
findings block; warnings route to owning sub-wave" — the structural
correction to the "good enough" enforcement bias identified 2026-04-14.

**Deferred from original v1.3.0 scope**: Visual Review Packages already shipped in
v1.2.0-dev; confidence scoring (Tier 2 F) moves to v1.4.0.

### v1.3.1 / v1.3.2 / v1.4.0 (sketched, updated 2026-04-14)
- **v1.3.1**: §11.5-P3 (structural sub-wave 6.3), §11.5-P4 (security 6.4),
  §11.5-P9 (planning MCP integration). Astro pack (§9.5-P3), Python pack
  upgrade (§9.5-P4), TS/JS pack (§9.5-P5). §10 ReviewAgent foundation (P1)
  + highest-value agents (P2).
- **v1.3.2**: §11.5-P5 (performance 6.5), §11.5-P6 (polish 6.6). Rust pack
  (§9.5-P6). Remaining review agents (§10.7-P3/P4/P5).
- **v1.4.0**: §11.5-P10 (RNOP MCP integration — blocks on RNOP MCP server
  existing). C/C++/Java/Shell/Dockerfile packs (§9.5-P7), shared-package
  extraction (P8), confidence scoring (Tier 2 F), optional multi-tier LLM
  orchestration.

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

### 8.4 Pack 1 — Go (✅ shipped v1.3.0-dev, 2026-04-14)

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
| ~~9.5-P1~~ | ~~`QualityToolRunner` abstraction + Go pack adapters (golangci-lint, go vet, gosec, gofmt)~~ | ✅ shipped | v1.3.0-dev |
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

---

## 11. Production-Grade Quality Pipeline (v1.3.x target)

### 11.0 Why this exists

Spec2's job is "requirements → production-quality code." §8/§9/§10 raise
the floor of per-language validation, but a single-pass codegen with
non-fatal quality checks is not production-grade — that's "good enough."
This section defines the multi-pass quality pipeline that sits inside Wave 6,
plus its integration with two sister tools in the CompanyOS ecosystem.

**The three-tool pipeline** (each tool owns a distinct phase):

1. **CompanyOS planning module** — `/home/swarm/CompanyOS2/companyos/companyos/planning/`.
   Exposes 34 MCP tools via `scripts/mcp-server-lite.py` (`plan_create`,
   `plan_set_focus`, `plan_checkpoint`, `plan_add_decision`,
   `plan_add_constraint`, `plan_add_contract`, …). Plans persist as JSON in
   `~/.local/share/companyos/plans/` — survives context compression. Documented
   in CompanyOS2 CLAUDE.md §18. Produces a coherent, context-resilient project
   plan that survives compression.
2. **spec2** — materialises the plan into code via Waves 1-6 + the §11
   quality sub-waves below to drive code from "compiles" → "production-grade."
3. **RNOP MCP tool** (Recursive N-Order Optimization Protocol — **planned**;
   methodology at `CompanyOS2/docs/automation/RECURSIVE_N_ORDER_OPTIMIZATION.md`,
   partial code implementation may exist but **location is unverified as of
   2026-04-14** — must be located/built before §11.5-P10). Wraps regen loops
   with structural reasoning: when a wave fails, RNOP reasons about *why*
   (root cause / N-order failure cascades) and what patch *philosophy*
   applies — not mechanical "fix the errors." Eliminates symptom-patching.

The combination is what makes the pipeline production-grade. Each tool alone
covers part of the surface; together they cover the path from intent →
verified code without single-pass perfection assumptions.

### 11.1 Wave 6 sub-waves (post-codegen quality pipeline)

After Wave 6.0 (initial codegen — existing), every component runs through
six issue-gated sub-waves. Each sub-wave is **skipped if the prior pass +
deterministic tools left zero findings in its category** — keeps token cost
bounded.

| Sub-wave | Category | Inputs to LLM (on regen) | Tooling | Wave gate (must pass to advance) |
|----------|----------|---------------------------|---------|-----------------------------------|
| 6.0 | Initial codegen | spec + pack prompt | (none) | Always runs |
| 6.1 | **Correctness** — compile, static, type-check | code + ERROR-severity findings (itemized) | go vet / tsc / pyright / clippy / cargo check | Zero ERROR-severity findings |
| 6.2 | **Test correctness** — generate tests, run, itemize failures | code + test output + structured failure table + spec | `go test -json` / `vitest --reporter=json` / `pytest --json-report` + anti-hollow scan | All tests green AND anti-hollow clean |
| 6.3 | **Structural** — modularity, cohesion, circular deps, import order, idempotency, API surface | code + structural findings | go-imports / madge / import-linter / per-pack structural rules | No structural ERROR findings |
| 6.4 | **Security** — SAST, secrets, injection, crypto misuse | code + SAST findings | gosec / semgrep / trivy / bandit | No HIGH-severity findings |
| 6.5 | **Performance** — complexity, allocation hot paths, N+1, concurrency hazards | code + complexity report | gocyclo / radon / custom heuristics | Complexity below per-pack threshold |
| 6.6 | **Polish** — doc comments, error messages, observability, dependency hygiene | code + style findings | revive / pydocstyle / per-pack rules | No critical polish gaps |

**Severity routing rule (locked):**
- `ERROR` → **blocks** the sub-wave that owns its category, triggers regen
  with itemized findings.
- `WARNING` → does NOT block. **Routed by category to the sub-wave it
  belongs in** (security warning lands in 6.4's regen input, perf warning
  in 6.5, etc.). If the owning sub-wave already passed without errors, the
  warnings surface in the visual review package without forcing regen.
- `INFO` → logged, surfaced in review, never gates anything.

No catch-all "warnings pass." Each warning is owned by exactly one sub-wave
based on its category.

### 11.2 Itemized-failure regen prompt shape

When a sub-wave fails, the regen prompt is **structured** (not "fix stuff"):

```
You implemented <component>. The previous attempt had <N> findings in
sub-wave <X> (<category>):

  1. [<file>:<line>] <tool>:<rule_id> — <message>
     Remediation hint: <hint>
  2. [<file>:<line>] ...

Regenerate the file. Preserve all behavior NOT mentioned above. Do not
introduce new dependencies. Do not change exported function signatures.
```

This works because the LLM sees exact locations + rule IDs + remediation
guidance, which makes targeted patches possible without losing the rest of
the implementation.

**For test failures (Wave 6.2):**

```
Test results: <P> passed, <F> failed, <S> skipped.

Failures:
  1. TestFooBar (file_test.go:42)
     Expected: <expected_value>
     Actual:   <actual_value>
     Diff:     <unified diff if printable>
  2. ...

Anti-hollow findings: <H>
  - TestBaz (file_test.go:88) — zero_assertions: ...

Regenerate ONLY the failing parts of the implementation OR test code as
appropriate. Preserve passing tests verbatim.
```

The structured failure table comes from `go test -json` /
`vitest --reporter=json` / `pytest --json-report` — each pack's adapter
parses the relevant format into a normalized `TestFailure` shape (sibling
to `QualityIssue`).

### 11.3 Token strategy

Naive N-waves-per-file is token-prohibitive. The pipeline reduces cost via:

| Strategy | Cost effect | Where applied |
|----------|-------------|----------------|
| **Issue-gated** | Skips sub-waves with zero findings → most files only pay for 6.0 + maybe one regen | All sub-waves |
| **Tool-first, LLM-second** | Tools find issues deterministically (free); LLM only sees the issue list and produces a targeted patch | 6.1, 6.3, 6.4, 6.5, 6.6 |
| **Itemized regen** | LLM doesn't reread the whole spec — only the deltas | All regen calls |
| **Self-consistency (reserved)** | N candidates, pick lowest-issue. N× cost. | Only for 6.0 if codegen quality is empirically poor on a given pack |
| **Single bulked prompt** (REJECTED) | One prompt with all rules upfront. LLM skips rules under load — quality ceiling too low | — |

Expected steady-state cost vs. baseline v1.2.0: **~1.3-1.8× tokens** per
component when generation is good, up to **4-5×** when many regens are
needed. Acceptable because the alternative is hand-fixing.

### 11.4 Three-tool integration contracts

| Pair | Direction | Contract |
|------|-----------|----------|
| Planning → spec2 | Plan provides spec2 with system/subsystem/component decomposition + cross-cutting decisions/constraints/contracts. Spec2 reads via MCP `plan_get_section` / `plan_get_focus`. | Plan must use sections matching spec2's wave shape. Decisions/constraints flagged `affects: codegen` flow into Wave 6 prompts. |
| spec2 → planning | After Wave 6.0, spec2 calls `plan_update_status(section, completed)`. After Wave 6.1-6.6, spec2 calls `plan_add_decision` for any architectural choice forced by tool findings. | Spec2 never edits sections it didn't author. Plan-supplied decisions are immutable from spec2's side. |
| spec2 → RNOP | When a sub-wave's max-regen-attempts exhausts, spec2 hands the failure history (initial code, each regen attempt, each finding set) to RNOP, which produces a structural-mitigation patch philosophy (not the patch itself). | RNOP returns reasoning, not code. Spec2 then runs one final regen with the RNOP philosophy in the prompt. |
| RNOP → planning | If RNOP determines the failure is structural (spec is wrong, not code), it calls `plan_add_decision` flagging the spec section needing revision. | Spec2 halts the wave and surfaces to user; humans/planning loop revise the spec. |

**No tool runs in isolation.** Spec2 without planning still runs (degraded —
missing cross-section decisions). Planning without spec2 still produces
plans (degraded — no codegen feedback). RNOP without spec2 still produces
reasoning (degraded — no concrete failure data). Each is independently
useful but the combination is what makes the "production-grade autonomous
code gen" claim defensible.

### 11.5 Delivery phasing

| Phase | Scope | Effort | Target |
|-------|-------|--------|--------|
| 11.5-P1 | Sub-wave 6.1 — correctness gate; ERROR-severity findings fail Wave 6 | 2-3h | v1.3.0-dev |
| 11.5-P2 | Sub-wave 6.2 — test gen + run + itemized failures + anti-hollow gate | 4-6h | v1.3.0-dev |
| 11.5-P3 | Sub-wave 6.3 — structural (modularity, circular deps, import order) | 4-5h | v1.3.1 |
| 11.5-P4 | Sub-wave 6.4 — security (HIGH-severity gosec/semgrep/trivy fatal) | 2-3h | v1.3.1 |
| 11.5-P5 | Sub-wave 6.5 — performance (complexity gate) | 3-4h | v1.3.2 |
| 11.5-P6 | Sub-wave 6.6 — polish (docs, dep hygiene, observability) | 3-4h | v1.3.2 |
| 11.5-P7 | Itemized-failure regen prompt shape across all sub-waves | 3-4h | v1.3.0-dev (foundational — blocks P1+) |
| 11.5-P8 | Severity-routing dispatcher (warnings → owning sub-wave) | 2-3h | v1.3.0-dev |
| 11.5-P9 | Planning MCP integration (`plan_get` / `plan_update_status` / `plan_add_decision` in orchestrate.ts) | 4-6h | v1.3.1 |
| 11.5-P10 | RNOP MCP integration (handoff on max-attempts exhaustion) | 4-6h | v1.4.0 — **blocks on RNOP MCP existing** |

**Estimated total:** 30-44h across 4-6 focused days, spread v1.3.0-dev → v1.4.0.

### 11.6 Locked constraints (apply across all sub-waves)

- **Each sub-wave preserves §1.1 isolation contract.** Generator agent for a
  sub-wave receives only its category's findings + the file under test +
  the spec section. No sibling specs. No cross-wave findings bleed.
- **No sub-wave silently passes.** Missing tools → flagged in report. Tool
  errors → flagged. Empty issue list with healthy tool output → genuinely passed.
- **Determinism over speed.** Same input + same tool versions → same findings
  list. Floats / random data forbidden in tool output parsing.
- **Max-regen-attempts per sub-wave: 3** (matches existing Wave 6 hallucination
  loop). After 3, hand to RNOP if available, else surface to user with the
  full failure history.
- **Patch-only regen.** Regen prompts say "regenerate ONLY <X>, preserve
  everything else." LLM-induced collateral changes are themselves a
  re-trigger of upstream sub-waves.

### 11.7 Open questions

1. **Test-generation scope** — does spec2 currently generate tests, or only
   implementation? §11.5-P2 needs an explicit test-generation step if not.
   *Status:* investigation needed before P2 starts.
2. **RNOP MCP server** — partial implementation may exist (user reports
   2026-04-14, location unknown). Verify before P10. If absent, RNOP MCP
   is a separate workstream and 11.5-P10 blocks on it.
3. **Self-consistency triggering** — at what failure rate does it become
   cheaper than further regens? Empirical question; defer until 6.0 has
   measurable failure rates per pack.
4. **Per-pack threshold tuning** — complexity gate for 6.5, structural rules
   for 6.3 — initial values are guesses; tighten with usage data.

