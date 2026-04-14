# spec2-mcp — testing and production readiness notes

Three test levels, with honest commentary about what each does and doesn't cover.

---

## Level 1 — automated (synthetic)

```bash
npm test
```

Runs both:

- **`smoke-test.mjs`** (14 checks) — spawns the server as a subprocess, speaks
  JSON-RPC over stdio, exercises every tool's happy path and canonical error
  cases. Does NOT make real LLM calls (uses empty-body fixtures).
- **`stdio-hygiene-test.mjs`** — starts a build job (which fires orchestrator
  `console.log` output) and asserts every line on stdout is valid JSON-RPC.
  Protects against the class of bugs where a background job corrupts the MCP
  protocol stream (we hit this exact bug during development — see the `stderr`
  log-sink fix in `utils/jobs.ts`).

**What Level 1 catches:** protocol-shape errors, missing tools, broken
argument schemas, stdio contamination, dead imports.

**What Level 1 does NOT catch:** real LLM behavior, client-side rendering of
tool descriptions, working-directory assumptions, concurrent-invocation
races, environment-variable inheritance.

---

## Level 2 — real Claude Code session (manual, ~2 min, no API keys needed)

This verifies the server loads in a real client and the schema descriptions
render sanely. No LLM calls — just `spec2_status` which reads disk.

```bash
# 1. Install the server entry (preserves existing MCP servers)
cd /home/swarm/spec2/skills/spec2-mcp
npm run install:claude

# 2. Restart Claude Code (MCP is loaded at session start)

# 3. In a Claude Code session, in any directory:
#    > Use the spec2_status tool.
#
# Expected response: {status: "no_checkpoint", ...} if no .spec2 exists,
# or the current phase if one does.
```

**If this works:** schema is valid, server launches, tool is discoverable,
response renders.

**If it fails:**
- Check Claude Code's MCP server logs (location depends on your install).
- Run the server manually to see stderr: `node dist/server.js` then type
  `{"jsonrpc":"2.0","id":1,"method":"initialize",...}` — it should respond.

---

## Level 3 — full build via MCP (manual, needs API keys + budget)

End-to-end: drive a real spec2 build through `spec2_build`, watch wave
transitions via `spec2_status`, confirm artifacts appear on disk.

```bash
export GROQ_API_KEY=...
export OPENROUTER_API_KEY=...
# (or ANTHROPIC_API_KEY)

# In Claude Code session, in a clean project directory:
# > Use spec2_build with requirements: "Build a URL shortener with rate limiting"
#   language: "typescript"
# > (returns jobId)
# > Use spec2_status with jobId: "..." every minute or two.
# > When completed, check ls .spec2/
```

**Status:** Level 3 has NOT been run against a real build yet — blocked on
Groq free-tier limits (413 at 16K tokens). With the Integration Registry
shipped in v1.2.0-dev, Tier 4's token cost is ~10x lower, which should make
Level 3 feasible on Groq paid tier or OpenRouter. When you run it, record
any issues here.

---

## Known limitations (v1.2.0-dev)

### Working-directory semantics

The MCP server inherits cwd from the Claude Code process, which is typically
the directory you launched Claude Code from. Builds write `.spec2/` in that
cwd. If you expect builds to happen in a specific project directory, make
sure Claude Code was launched from there.

### Environment variables

API keys (`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) must be
set in the shell that launches Claude Code. The MCP server inherits that
environment. Keys set only in a specific Claude Code agent session won't
reach the MCP process.

### Client disconnection mid-build

If Claude Code closes, the MCP server process dies, and any running job is
lost in memory. The on-disk checkpoint survives, so `/spec2-resume` (or the
MCP `spec2_resume` tool in a new session) can continue from the last wave.
Checkpoint granularity is per-wave, so you may redo at most one wave.

### Log payload size

`spec2_logs` without `tail` can return up to 10,000 lines per job — a large
payload for an MCP response. Prefer `tail: 30` for normal status checks;
fetch the full log only when debugging.

---

## Reporting issues

If something breaks in Level 2 or Level 3, capture:

1. `npm test` output (Level 1 still green?)
2. Exact tool call made from Claude Code
3. Server stderr (visible if you ran Claude Code from a terminal)
4. Contents of `.spec2/checkpoints/latest.json` if one exists

Open an issue or annotate this file with the repro.
