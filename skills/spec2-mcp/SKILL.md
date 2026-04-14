---
name: spec2-mcp
executable: false
description: MCP server exposing spec2 as tools for Claude Code, Gemini CLI, and other MCP clients
---

# spec2-mcp — MCP Server

Exposes the spec2 wave-based orchestrator as [Model Context Protocol](https://modelcontextprotocol.io)
tools over stdio. Any MCP client (Claude Code, Gemini CLI, Cline, Zed, etc.)
can drive spec2 builds without invoking the slash-command skill.

## Tools exposed

| Tool            | Purpose                                                                    |
|-----------------|----------------------------------------------------------------------------|
| `spec2_build`   | Start a new build. Async — returns `{jobId}` immediately.                  |
| `spec2_resume`  | Resume from the latest checkpoint. Async — returns `{jobId}` immediately.  |
| `spec2_status`  | Get status of a specific job (`jobId`) or the current checkpoint.          |
| `spec2_jobs`    | List all jobs known to this server process.                                |
| `spec2_logs`    | Fetch captured log lines from a job.                                       |

All build/resume calls are **asynchronous**: the tool returns a job ID immediately
and the orchestrator runs in the background. Poll `spec2_status(jobId)` to track
progress. Rationale: builds take minutes — a synchronous tool call would exceed
most MCP client timeouts.

## Install

```bash
cd /home/swarm/spec2/skills/spec2-mcp
npm install
npm run build
```

The main spec2 skill must also be built (the MCP server imports its compiled output):

```bash
cd /home/swarm/spec2/skills/spec2
npm install
npm run build
```

## Configure Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "spec2": {
      "command": "node",
      "args": ["/home/swarm/spec2/skills/spec2-mcp/dist/server.js"]
    }
  }
}
```

## Configure Gemini CLI

Add to `~/.gemini/settings.json` under `mcpServers`:

```json
{
  "mcpServers": {
    "spec2": {
      "command": "node",
      "args": ["/home/swarm/spec2/skills/spec2-mcp/dist/server.js"]
    }
  }
}
```

## Environment

The server inherits the same environment variables as the skill itself:
`GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `SPEC2_TESTING_MODE`, etc.

## Agent isolation

The MCP transport is a pass-through — it does not alter the isolation contract.
The `Ctx` object inside the orchestrator is process-local; the MCP server only
sees sanitized Job metadata (status, progress, logs). No LLM ever sees the MCP
server's own state.
