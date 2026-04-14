# spec2

**Requirements-to-code generation with wave-based validation and strict agent isolation.**

spec2 turns a plain-English requirements statement into a tiered specification
(system → subsystems → components → integration), a set of validation
artifacts, and finally generated code — with per-stage validators that reject
underspecified or hallucinated output and regenerate from actionable
feedback. The design goal is output you don't have to babysit.

Version 1.2.0-dev adds two transport surfaces (MCP stdio + Fastify HTTP)
built on a shared job tracker, so the same core orchestrator can be driven
from a Claude Code slash command, any MCP client (Gemini CLI, Cline, Zed,
…), or a scripted HTTP caller. It also adds an AST-based detector for
hollow tests — tests that pass without exercising real behavior.

---

## Architecture snapshot

Generation runs through six waves. Each wave has a generator agent, a
validator agent, and a regeneration loop (max 3 attempts per spec):

```
Wave 1  System spec
Wave 2  Subsystem specs   (parallel)
Wave 3  Component specs   (parallel)
Wave 4  Integration spec
Wave 5  Artifacts         (correspondence matrix, completeness manifest,
                           test requirements, architecture baseline)
Wave 6  Code              (parallel, anti-hallucination verifier)
```

Between waves there is a sync barrier and a cross-spec **wave-alignment**
check that catches overlapping responsibilities across siblings. Each fresh
LLM call receives only a scoped slice of orchestrator state — agents never
see sibling specs at the same tier. The full invariants are locked in
[`ROADMAP.md` §1 (Architectural decisions)](./ROADMAP.md#1-architectural-decisions-locked--dont-revisit-without-explicit-reason).

State between waves lives in a process-local `Ctx` object and is checkpointed
to `.spec2/checkpoints/latest.json` so an interrupted build can resume at the
next wave boundary.

---

## Quick start

Three entry points, same core.

### 1. Slash command inside Claude Code

```
/spec2-new "URL shortener with per-user rate limiting" typescript
/spec2-status
/spec2-resume
```

Skill definition: [`skills/spec2/SKILL.md`](./skills/spec2/SKILL.md).

### 2. MCP tool from any MCP client

Works with Claude Code, Gemini CLI, Cline, Zed — anything that speaks MCP
stdio. Exposes five tools: `spec2_build`, `spec2_resume`, `spec2_status`,
`spec2_jobs`, `spec2_logs`. Build/resume calls are **async**: the tool
returns a `jobId` immediately and the client polls `spec2_status`.

Setup, config examples, and tool reference:
[`skills/spec2-mcp/SKILL.md`](./skills/spec2-mcp/SKILL.md).

### 3. HTTP API for scripting and CI

```bash
curl -X POST http://localhost:3737/builds \
  -H 'Content-Type: application/json' \
  -d '{"requirements":"URL shortener with rate limiting","language":"typescript"}'
# → {"jobId":"abc-123","status":"queued"}

curl http://localhost:3737/jobs/abc-123
```

Seven endpoints mirroring the MCP surface. Localhost-only, no auth — built
for trusted automation. Full reference:
[`skills/spec2-api/SKILL.md`](./skills/spec2-api/SKILL.md).

---

## Setup

### Environment variables

spec2 uses LLMs with multi-provider failover. Configure at least one:

| Variable              | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `GROQ_API_KEY`        | Groq (primary; free tier, fast, low context limits).     |
| `OPENROUTER_API_KEY`  | OpenRouter (secondary fallback).                         |
| `ANTHROPIC_API_KEY`   | Anthropic (tertiary fallback).                           |
| `SPEC2_TESTING_MODE`  | Set to `true` to cap context at free-tier limits.        |

Per-provider kill switches (`DISABLE_GROQ`, `DISABLE_OPENROUTER`,
`DISABLE_ANTHROPIC`) are available for debugging.

### Build the skills

All five skills are TypeScript and compile to `dist/`. Build the core first,
then the transports that import from it:

```bash
cd skills/spec2        && npm install && npm run build
cd skills/spec2-mcp    && npm install && npm run build
cd skills/spec2-api    && npm install && npm run build
cd skills/spec2-resume && npm install && npm run build
cd skills/spec2-status && npm install && npm run build
```

### Smoke tests

```bash
cd skills/spec2     && node verification/anti-hollow.test.mjs   # 47/47
cd skills/spec2-mcp && npm run smoke                            # 12 checks
cd skills/spec2-api && npm run smoke                            # 14 checks
```

---

## Key features (v1.2.0-dev)

Every item below is backed by code that ships today.

- **6-wave generation pipeline with regeneration loops.** Each wave has a
  fresh-agent validator; failed specs regenerate with accumulated feedback
  (max 3 attempts). See `skills/spec2/orchestrate.ts` and
  `skills/spec2/validators/`.
- **Strict agent isolation.** Each fresh LLM call sees only its scoped
  slice — system spec flows as read-only NFR context to Waves 3/4/5/6;
  sibling specs at the same tier are never shared during generation.
  Cross-tier overlap is caught post-generation by wave-alignment validators
  (`skills/spec2/validators/wave-alignment.ts`).
- **SHA256 spec locking.** All specs are content-hashed after validation so
  downstream stages can detect tampering (`skills/spec2/utils/lock.ts`).
- **Multi-provider LLM failover** (Groq → OpenRouter → Anthropic) with
  rate-limit backoff (`skills/spec2/utils/llm.ts`).
- **AST-based anti-hallucination detection** for generated code — catches
  references to nonexistent symbols / types / imports.
- **AST + regex anti-hollow test detection** (new in v1.2). Finds tests
  that pass without exercising real behavior: zero assertions, tautologies
  (`expect(1).toBe(1)`), empty bodies, mock-only success, silent error
  catching, low assertion density. TS/JS uses `@babel/parser`; Python uses
  regex heuristics. 47-check self-test suite verifies every rule fires on
  canonical hollow code and does not fire on healthy code
  (`skills/spec2/verification/anti-hollow.ts` and
  `verification/anti-hollow.test.mjs`).
- **Resume from checkpoint.** Killed process can restart at the next wave
  boundary. `/spec2-resume` (and the MCP/HTTP equivalents) read
  `.spec2/checkpoints/latest.json`, rehydrate `Ctx`, and re-enter the
  pipeline — no agent sees the checkpoint file
  (`skills/spec2-resume/resume.ts`, `skills/spec2/utils/checkpoint.ts`).
- **MCP + HTTP transports from one core.** Both `skills/spec2-mcp/` and
  `skills/spec2-api/` import the compiled orchestrator and a shared job
  tracker (`skills/spec2/utils/jobs.ts`) — the transports cannot drift.

---

## What is NOT in v1.2.0-dev

Called out so you don't go looking for it. Rationale for each deferral lives
in [`ROADMAP.md` §3](./ROADMAP.md#3-scope-for-next-work--prioritized-buckets).

- **Visual Review Packages** (1-page summaries + Mermaid diagrams for spec
  review) — roadmap Tier 2, deferred.
- **Confidence scoring and routing** (per-spec 0–100 scores, auto-accept
  thresholds) — roadmap Tier 2, deferred; needs calibration data.
- **`/spec2-init-existing`** (reverse-engineer specs from existing code) —
  roadmap Tier 2, deferred; untested design space.
- **Automated alignment conflict resolution** — currently throws on
  wave-alignment conflict; manual resolution only.
- **Mutation testing integration** (Stryker / mutmut / PITest) — roadmap
  Tier 3, deferred.
- **Code quality tool integrations** (SonarQube, Semgrep) — roadmap Tier 3,
  deferred; significant overlap with existing anti-hallucination.
- **Integration Registry (SQLite)** for token-efficient Tier 4 generation —
  roadmap Tier 1, not yet shipped (dependency installed, not wired).
- **Wave 6 integration-test runner.** Phase 4 currently emits a header only
  and does not execute integration tests. Roadmap Tier 2.
- **End-to-end validation on a real 10-component system** — blocked on LLM
  API quota (free Groq tier rejects the 16K-token Tier 4 prompts). See
  [`ROADMAP.md` §3 Blocked](./ROADMAP.md#blocked).

---

## Links

- [`ROADMAP.md`](./ROADMAP.md) — source of truth for scope, decisions, deferrals.
- [`CHANGELOG.md`](./CHANGELOG.md) — release history.
- [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md) — current status snapshot.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution guide.
- [`LICENSE`](./LICENSE) — MIT.
- [`docs/archive/`](./docs/archive/) — historical design docs (do not use as a current reference).
