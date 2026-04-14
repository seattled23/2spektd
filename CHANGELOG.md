# Changelog

All notable changes to spec2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Go Language Pack (§8 Pack #1, §9.5-P1)
- **`skills/spec2/packs/`** — LanguagePack registry (§8.1). Pluggable
  per-language contract: codegen prompt template, hallucination detector,
  hollow-test detector, quality adapters. Pack-aware dispatch threads
  through `anti-hallucination.ts`, `anti-hollow.ts`, `codegen.ts`, and
  `getExtension` (in `orchestrate.ts` + `utils/persist.ts`).
- **`skills/spec2/packs/go/`** — Go pack manifest. Go moves from "stub
  returning passed:true" to first-class validation. Includes:
  - `codegen-prompt.ts` — Go-idiom guidance (error wrapping, import groups,
    test conventions, security rules) appended to Wave 6 LLM prompt.
  - `hallucination.ts` — regex + brace/string-aware comment stripper;
    Go stdlib allowlist (Go 1.25 roots); classifies each import as stdlib /
    third-party / internal / suspicious; catches `fake-*`, `generated-*`,
    RFC 2606 placeholder domains, template leakage, dotless non-stdlib.
  - `hollow-tests.ts` — brace-aware Go-test-function scanner. Detects
    `empty_body`, `zero_assertions`, `tautological_assertion` (if true /
    1 == 1), `mock_only` (gomock / testify-mock), `silent_catch` (defer
    recover without assertion), file-level `low_density` aggregate.
    Counts testify `assert.*` / `require.*` as assertions. Handles
    subtests (`t.Run`) by folding assertions into the parent test.
  - `lexer.ts` — shared `stripGoComments` + `findMatchingBrace` helpers
    (aware of strings, comments, rune literals).
- **`skills/spec2/quality/`** — `QualityToolAdapter` interface with
  `QualityIssue` shape byte-compatible with CompanyOS2's
  `tech_debt.py` dict (`{type, severity, file, line, rule, message,
  detected_at}`). `runAdapter()` + `runAll()` with hard subprocess
  timeouts, non-fatal tool-missing handling (§9.7).
- **`skills/spec2/quality/adapters/go/`** — four Go quality adapters:
  - `gofmt` — format drift detection (listing-only; never mutates code).
  - `go-vet` — stdlib static analyzer; temp-module sandbox for single-file input.
  - `golangci-lint` — meta-linter via JSON output; severity mapping
    promotes `errcheck`, `staticcheck`, `govet`, `typecheck`, `gosec`
    findings to error level.
  - `gosec` — security scanner with HIGH→error / MEDIUM→warning /
    LOW→info mapping.
- **48-check test suite** (`packs/go/manifest.test.mjs`) — registry
  integration, 8 hallucination patterns, 9 hollow-test patterns
  (including testify + subtest + silent-recover + tautological-numeric),
  plus live smoke tests against all four Go quality tools. MD5 usage in
  gosec fixture verifies the G401 weak-hash finding actually flows
  through the adapter pipeline.
- **Integration path**: Wave 6 `generateAndValidateCode()` now invokes
  `runAll(pack.qualityTools, …)` after hallucination check succeeds;
  quality findings are logged but non-fatal (§9.7).

### Changed
- `anti-hallucination.ts` and `anti-hollow.ts` now dispatch through the
  pack registry first; legacy TS/JS/Python switch branches remain as
  fallbacks pending v1.3.1 pack migrations.
- `getExtension()` in `orchestrate.ts` and `utils/persist.ts` now sources
  from `packs/index.ts::getExtensionForLanguage`; legacy language map
  preserved as fallback for unregistered languages.

### Architectural decision
- Go AST parsing uses regex + `go vet` subprocess instead of
  tree-sitter-go. The Go toolchain is already required for the quality
  adapters, so `go vet` gives compiler-grade semantic validation with
  zero new npm dependencies. Supersedes the §8.4 "tree-sitter-go OR shell
  to go/parser" open question.

### Added — Visual Review Packages
- **`skills/spec2/review/`** (~700 LOC) — deterministic extractor + renderer
  that converts Tier 1-4 spec markdown into 1-page human-facing review
  summaries with embedded Mermaid diagrams. No LLM calls; same input always
  produces the same output (modulo the footer timestamp).
- **Four extractors**, one per tier shape. Each returns a structured
  `…Extract` object plus a `warnings` list. Malformed LLM output degrades
  gracefully: missing sections become warnings, not crashes. Graceful
  degradation is tested on empty / malformed fixtures.
- **Mermaid diagrams per tier:**
  - System spec → `graph TD` subsystem map
  - Subsystem spec → `graph TD` with `subgraph` for internal components + inbound external-dependency edges
  - Component spec → `classDiagram` with types + public functions + import edges
  - Integration spec → `graph LR` with bidirectional contract edges
  - Node ids sanitized to `[A-Za-z][A-Za-z0-9_]*`; class-diagram member lines strip
    `():<>{}` which Mermaid can't parse
- **Disk layout:** `.spec2/review/system.md`, `.spec2/review/subsystems/<name>.md`,
  `.spec2/review/components/<name>.md`, `.spec2/review/integration.md`.
  Filenames sanitized against path-traversal (e.g. `../../evil` → `_evil`).
- **Orchestrator integration** (`orchestrate.ts`): `safeGenerateReview()` wraps
  each review call at post-validation points (wave 1 system, wave 2 per
  subsystem, wave 3 per component, wave 4 integration). Review failures log
  a warning and continue — review generation never fails a build.
- **Isolation invariant** (§1.5 pattern, same as Integration Registry):
  review module is orchestrator-local; never shown to an LLM. Enforced by a
  regression test that scans `dist/review/*.js` for `llm` imports and fails
  if any appear. This keeps the determinism promise verifiable.
- **58-check unit suite** (`review/review.test.mjs`) covering: extractor
  correctness against canonical fixtures per tier, Mermaid fence presence
  per tier, page-size budget (<6 KB), malformed-input graceful degradation,
  contract-party parser edge cases, deterministic rendering (modulo
  timestamp), path-traversal-safe filenames, and the LLM-import invariant.
- **Wired into `npm test`** via `test:review`.

### Fixed — concurrent-job log cross-contamination (critical)
- **Bug:** `runJobInBackground()` patched global `console.log/error/warn`
  inside the function body, saving the current impls to local variables and
  restoring them in `.finally()`. With two concurrent jobs, saves nested:
  job B's "originals" were actually job A's patched versions. When A finished
  first, it restored the real originals — but B's patches were now orphans
  writing to a still-live `finally` handler. When B finished, it restored
  A's patched versions back over the real originals, corrupting console for
  every subsequent job. Log buffers also interleaved: any console call made
  while both patches were live went to whichever job patched last.
- **Why Level 1 missed it:** only one smoke-test job ever ran at a time.
  The bug was documented in `spec2-mcp/TESTING.md` under "single-writer per
  process" but there was no regression test, and no transport enforced
  single-writer at the protocol level.
- **Fix:** replaced the save/restore stack with `AsyncLocalStorage`-backed
  per-job routing. The console patch is installed once (lazily on first
  job) and the patched functions look up the current job via
  `jobContext.getStore()`. Each `runJobInBackground` wraps its promise
  chain in `jobContext.run({ job }, () => fn())`, so every async
  continuation inside `fn()` — promises, awaited calls, setTimeout
  callbacks — inherits that job's context. Concurrent jobs each get
  their own store; writes never cross. Console calls outside any job
  context (e.g., server-startup logs) fall through to the original
  impls unchanged.
- **Regression guard:** `utils/jobs.test.mjs` — 29 checks covering
  2-concurrent, 5-concurrent (× 20 lines each, interleaved via
  `setTimeout`), out-of-context passthrough, per-job phase markers,
  and post-failure recovery. Zero cross-contamination across all
  tested scenarios. Wired into `npm test`.
- **Docs:** `spec2-mcp/TESTING.md` "single-writer per process" caveat
  removed in a follow-up pass.

### Changed — debt sweep (post v1.2.0-dev integration)
- **Rust pruned from language enum.** Shipped but never tested. Re-add
  when a real Rust build has been validated end-to-end. Affected: `skill.ts`
  (type union), `orchestrate.ts` + `persist.ts` (extension maps),
  `skills/spec2-mcp/server.ts` + `skills/spec2-api/server.ts` (tool enum
  schemas × 2 each), `skills/spec2/SKILL.md` (docs). Current set:
  `python | typescript | javascript | go | java`.
- **`skills/spec2/SKILL.md` feature list corrected.** Removed unshipped
  claims: "Visual Review Packages" (Tier 2, not built), "Confidence
  Scoring" (Tier 2, not built), "12-Layer Validation" (that's the legacy
  v1.0 path, not the v1.2 pipeline the skill actually runs), and
  "mutation testing >80%" (Tier 3, not built). Replaced with the actual
  shipped surface.
- **Broken symlink removed.** `skills/spec2-legacy/2spektd-upgrade`
  (dangling to `/home/swarm/2spektd/…`).
- **Legacy v1.0 docs annotated, not archived.** `validation/OUTLINE-STRONG-V2-SPEC.md`,
  `validation/IMPLEMENTATION-STATUS.md`, `validation/COMPLETION-SUMMARY.md`,
  `validation/QUICK-START.md` now carry a `⚠️ LEGACY DOCUMENT (v1.0 path)`
  header pointing to ROADMAP for the current architecture. Code under
  `validation/` is still imported by `mcp-server/server.py`; archiving
  docs without removing code would strand the legacy path. Full
  deprecation deferred to v1.3 decision.
- **`mcp-server/server.py` annotated as LEGACY.** Module docstring now
  explicitly calls out that it serves the v1.0 12-layer tools
  (`validate_component`, `detect_language`, ...) and coexists with the
  v1.2 TS MCP server (`skills/spec2-mcp/`, serving `spec2_build`, etc.)
  on disjoint tool namespaces. Deprecation candidate for v1.3.

### Fixed — MCP stdio protocol corruption (critical)
- **Bug:** `runJobInBackground()` in `utils/jobs.ts` tees `console.log/warn`
  through `process.stdout` so operators can watch progress. For the HTTP API
  this is fine — stdout is unrelated to the protocol. For the stdio MCP
  server, **stdout IS the JSON-RPC protocol stream**, and per MCP spec:
  *"Implementations MUST NOT write any data to stdout that is not a valid
  JSON-RPC message."* Orchestrator `console.log("🔷 PHASE 1: ...")` calls
  were corrupting the MCP stream during any running build.
- **Why the smoke test missed it:** The hand-rolled smoke-test client used
  a lenient `JSON.parse()` with a `catch` that silently dropped non-JSON
  lines. Real MCP clients may disconnect or misbehave on a corrupted stream.
- **Fix:** added `LogSink` type + `configureJobLogSink(sink)` to `jobs.ts`.
  Default remains `'stdout'` (HTTP + CLI unchanged). MCP server now calls
  `configureJobLogSink('stderr')` at startup — MCP clients explicitly
  ignore server stderr per spec.
- **Regression guard:** new `stdio-hygiene-test.mjs` starts a real build
  job, waits for orchestrator output, and asserts every byte on stdout is
  valid JSON-RPC. Verified: 4 violating lines → 0 after fix. Wired into
  `npm test` so this class of bug can't silently reappear.

### Added — MCP install tooling
- **`install-to-claude.mjs`** — idempotent installer that adds the spec2
  entry to `~/.claude.json` without touching existing MCP server entries.
  Backs up the config before modification. Refuses overwrite without
  `--force`. Supports `--print` for dry-run inspection.
  - `npm run install:claude` — install to ~/.claude.json
  - `npm run install:print` — print snippet without modifying anything
- **`TESTING.md`** — three-level test plan (automated / real Claude Code
  session / full build with API keys), plus honest documentation of known
  limitations: single-writer-per-process, working-directory semantics,
  environment inheritance, client-disconnect behavior, log payload size.

### Added — Integration Registry (SQLite)
- **`skills/spec2/registry/index.ts`** (643 LOC) — SQLite-backed metadata
  index of each component's public surface. Schema: `components`, `functions`,
  `types`, `exports`, `imports` tables. WAL mode, foreign keys, covering
  indexes. Parses Tier 3 component specs with lenient regex; records
  `parse_warnings` per component for downstream observability.
- **Wave 3 populates registry after validation** — `rebuildRegistry()` in
  `orchestrate.ts` ingests all component specs into `.spec2/registry.db`
  after Tier 3 passes. Idempotent — safe to re-run.
- **Wave 4 (Tier 4) now queries registry** via `getRegistrySummary()` instead
  of loading full component specs verbatim. For N components × ~12 pages each,
  verbatim loading can hit 15K+ tokens (blowing free-tier rate limits at 6K
  TPM). Registry summary targets <2K chars for 5 components — roughly a 10x
  reduction at Tier 4. Canonical 3-component fixture: 1690 chars JSON.
- **Disk fallback** — `buildComponentContext()` in `agents/tier4.ts` tries the
  registry first; falls back to loading full specs from disk if registry is
  unavailable (e.g., v1.1.0 checkpoint, standalone test).
- **Resume rehydration** — `ctxFromCheckpoint()` calls `rebuildRegistry()`
  when a checkpoint contains component specs, so v1.1.0 checkpoints work
  without manual migration.
- **70-check unit test suite** (`registry/registry.test.mjs`) covering
  schema idempotency, ingest of canonical + malformed specs, each query
  operation, summary size budget, and isolation-invariant assertions
  (summary excludes row ids, parse_warnings, ingested_at, full spec text).

### Added — Architecture §1.5 (isolation invariant for registry)
- **`ROADMAP.md §1.5`** — documents the registry's place in the isolation
  contract. The registry is orchestrator-local state (never passed to an
  LLM). Only `getRegistrySummary()` output enters Tier 4's prompt, and only
  as a curated public-surface view. Included / excluded table clarifies
  exactly what reaches the LLM vs what stays internal. Registry is
  populated AFTER Wave 3 validation — it indexes finalized specs, never
  participates in design reasoning.

### Changed — documentation pass
- **Archived 14 stale docs** to `docs/archive/`: `MVP_*`, `PHASE_A_*`,
  `2SPEKTD_*`, `VERIFICATION_*`, `IMPROVEMENTS_VISUAL.md`, `SESSION_*`,
  `STATUS.md`, `IMPLEMENTATION-COMPLETE.md`, `QUICK_START.txt`. All
  preserved (git-moved, not deleted) with a `docs/archive/README.md`
  explaining why each was archived. Root `.md` count: 16 → 5.
- **Rewrote `README.md`** (8.5 KB) — accurate to v1.2.0-dev. Three
  quick-start paths (slash commands, MCP, HTTP API). Honest "What is
  NOT in v1.2.0-dev" section matching ROADMAP Tier 2/3/Blocked.

### Removed — dead code / misleading logs
- `orchestrate.ts` Phase 4 no longer prints "Integration tests passed" for
  work that isn't done. Comment now references ROADMAP §3 Tier 2 as the
  owner of the integration-test runner.
- `agents/tier3.ts` "⚠️ MVP: Auto-approving" placeholder log removed.
  Replacement comment explains the design intent (validator is the review
  gate; Visual Review Package is a Tier 2 roadmap item).
- Broken symlink `skills/spec2/2spektd-new → /home/swarm/2spektd/...` deleted.

### Added — anti-hollow detection
- **`skills/spec2/verification/anti-hollow.ts`** — detector for hollow test
  patterns that pass without exercising real behavior. Catches: zero
  assertions, tautological assertions (`assert True`, `expect(1).toBe(1)`,
  `expect(null).toBeNull()`, `self.assertEqual(1, 1)`), empty/pass-only
  bodies, mock-only success, silent error catching, low assertion density.
- **TS/JS: AST-based** via `@babel/parser` + `@babel/traverse`. Correctly
  counts chained assertions as one (e.g., `expect(x).toBe(y)` = 1 assertion,
  not 2). Distinguishes variable subjects from literal subjects
  (`expect(result).toBe(5)` healthy; `expect(1).toBe(1)` flagged).
- **Python: regex heuristics.** Covers pytest (`def test_*`, `assert ...`)
  and unittest (`self.assertEqual/True/...`). Documented limitation: no
  Python AST in Node, so unusually indented or non-standard layouts may
  slip through.
- **47-check unit test suite** (`verification/anti-hollow.test.mjs`) with
  hand-crafted healthy + hollow fixtures per pattern. Run with
  `npm run test:anti-hollow`. A detector that lies is worse than no
  detector — the suite verifies every rule fires on canonical hollow
  code and does NOT fire on healthy code.
- **Exposed via both transports:**
  - MCP: new `spec2_check_tests(code, language)` tool
  - HTTP: new `POST /check-tests` endpoint
  - Both return the full `HollowReport` structure.

### Added (v1.2.0-dev)
- **`skills/spec2-mcp/`** — MCP stdio server exposing spec2 to any MCP client
  (Claude Code, Gemini CLI, Cline, Zed, etc.). Five tools: `spec2_build`,
  `spec2_resume`, `spec2_status`, `spec2_jobs`, `spec2_logs`. All build/resume
  calls are asynchronous (return `jobId` immediately, client polls). 12 smoke
  checks covering initialize handshake, tool surface, and every tool's happy +
  sad paths. Run with `npm run smoke`.
- **`skills/spec2-api/`** — Fastify-based HTTP API. Seven endpoints mirroring
  the MCP surface. Localhost-only by default, no auth (trusted automation
  only). Unblocks automated E2E testing: scripts can POST to `/builds` and
  poll `/jobs/:id` without going through Claude Code. 14 smoke checks, run
  with `npm run smoke`.
- **`skills/spec2/utils/jobs.ts`** — shared job tracker imported by both
  transports. Creates jobs, runs the orchestrator in the background, tees
  console output into a per-job log buffer, parses wave progress markers.
  In-process (invocation-scoped); checkpoint on disk is still the durable
  build-state source of truth.

### Architecture
- **Single core, two transports.** Both MCP and HTTP servers import the
  compiled orchestrator + jobs module from `../spec2/dist/`. No logic
  duplication; impossible for the two transports to drift. Smoke tests verify
  each transport end-to-end (25 checks total, all passing).
- Agent isolation contract unchanged. Transports see only sanitized Job
  metadata; LLM calls never see transport state or Ctx.

## [1.1.0] - 2026-04-13

### Added
- `/spec2-resume` now functional (previously a stub). Loads checkpoint JSON and
  dispatches to `orchestrateSpec2FromCheckpoint`, which skips completed waves and
  re-enters the pipeline with rehydrated state. Smoke-tested: wave3→wave4 and
  wave5→wave6 routing verified end-to-end.
- System spec propagated to Waves 3/4/5/6 as read-only `SYSTEM CONTEXT` for NFR
  awareness. Downstream tier generators can now honor performance/security
  targets without receiving sibling specs.
- Wave 5/6 resume-safety: generators skip components whose artifacts/code
  already exist in the checkpoint.

### Changed
- `orchestrate.ts` refactored — waves extracted into standalone functions
  operating on a `Ctx` object. Fresh runs and resumes share the same wave
  implementations; no duplication.
- Tier 2 validator now enforces rigorous Dependencies declarations. Vague
  references like "uses LoggingService" are ERROR-level; specs must name the
  contract surface (function signatures / types / endpoints). Rationale: the
  parent subsystem's Dependencies section is the only channel by which external
  contracts reach component designers, since Tier 3 never sees sibling subsystems.

### Architecture note
- Agent isolation contract clarified: `Ctx` is orchestrator-local state only and
  is never passed to an LLM. Each fresh agent receives its scoped slice
  (system spec as read-only context + immediate parent as design target).
  Cross-tier concerns continue to be handled by Wave Alignment validators
  *after* generation, not by widening agent views.

## [1.0.0] - 2026-04-05

### Added
- Initial release of spec2
- 12-layer validation framework
- Support for 4 languages (Go, TypeScript, Python, Shell)
- `/spec2:new` skill for building new components
- `/spec2:upgrade` skill for validating existing code
- MCP server with 4 tools (validate, detect language, install tools, check status)
- Agent orchestration system with context isolation
- Anti-reward-hacking mechanisms (immutable artifacts, one-shot code gen)
- Unlimited fix iteration with fresh context per attempt
- 44 validation layer scripts
- Complete documentation (spec, quick start, guides)

[Unreleased]: https://github.com/seattled23/spec2/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/seattled23/spec2/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/seattled23/spec2/releases/tag/v1.0.0
