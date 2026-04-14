# Spec2 Roadmap

**Last updated:** 2026-04-13 (post v1.1.0)
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
| J | **Code quality tools** (#9)           | 4h     | Low    | SonarQube is a server install. Semgrep easier. Significant overlap with existing anti-hallucination. Low marginal value. |

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
- ~~**Rust in language enum, never tested**~~ — ✅ pruned in v1.2.0-dev. Re-add when actually validated.
- **Legacy v1.0 12-layer path still in repo** — `validation/*.md` and `mcp-server/server.py` describe the shipped-but-superseded 12-layer framework. Annotated with LEGACY headers pointing to current architecture. Full deprecation candidate for v1.3.0.
- **`validation/*.md` docs annotated, not archived** — rationale: code under `validation/` is still imported by `mcp-server/server.py`. Archiving docs without removing code would strand the legacy path. Decision deferred.

---

## 5. Design questions still open

Not blocking, but will need answers before the related work:

1. **MCP tool naming** — `spec2_build` vs `spec2_new` (matches slash command). Pick before shipping.
2. **Resume concurrency** — if two processes call `spec2_resume` simultaneously, latest.json races. Add file lock? For now document as single-writer.
3. ~~**Language support beyond 5** — currently `python | typescript | javascript | go | java | rust`. Rust is hardcoded but never tested. Prune or test.~~ ✅ resolved 2026-04-13 — rust pruned. Current set: `python | typescript | javascript | go | java`. Re-add rust when there is evidence of a real build succeeding.
4. **Artifact storage on resume** — if a user manually edits an artifact between interruption and resume, should resume re-validate? Currently skipped. Probably fine but document.
5. **What "complete" means** — `phase: 'complete'` blocks resume. Should there be a `/spec2-extend` command to add components to a complete project without starting over?

---

## 6. Release candidates

### v1.2.0 target
Ships Tier 1 (MCP + anti-hollow + registry + docs). After this, spec2 is usable
from Claude Code and Gemini CLI natively, and the "anti-hollow testing" claim in
the README is actually backed by code.

### v1.3.0 target
Ships Tier 2 polish (Visual Review Packages, confidence scoring). Quality-of-life,
not correctness.

### v2.0.0 target
Blocked on E2E validation proving the pipeline produces production-quality code
on a non-trivial system (say, a 10-component service with real integration tests).
Can't declare "production" without this.

---

## 7. Process notes

- When adding a new item here, include **effort, value, risk, and why**. Items without justification get cut.
- When completing an item, move it to `## 2 What's shipped` and strike it from Tier N with a line pointer: `✅ shipped in v1.X.Y`.
- Don't add items that duplicate existing code. If a thing exists and needs polish, say "polish existing X" with a file path.
- "Done" means: code written, type-checks clean, at least a smoke test run, docs updated, CHANGELOG entry written. Not "code exists and probably works."
