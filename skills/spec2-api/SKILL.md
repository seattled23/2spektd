---
name: spec2-api
executable: false
description: HTTP API exposing spec2 for automation, testing, and multi-agent orchestration
---

# spec2-api — HTTP API

Fastify-based HTTP server exposing the spec2 orchestrator over REST. Built for:

- **Automated E2E testing** — drive spec2 from scripts without shelling to the skill runner
- **Multi-agent orchestration** — other agents (yours or third-party) can call spec2 as a service
- **CI integration** — run spec2 as part of a pipeline

Pairs with `spec2-mcp` (same core, different transport).

## Endpoints

| Method | Path                     | Purpose                                                             |
|--------|--------------------------|----------------------------------------------------------------------|
| GET    | `/health`                | Health check. Returns `{status: "ok"}`.                              |
| POST   | `/builds`                | Start a build. Body `{requirements, language?}`. Returns `{jobId}`.  |
| POST   | `/resume`                | Resume from latest checkpoint. Returns `{jobId}`.                    |
| GET    | `/jobs`                  | List all jobs known to this server.                                  |
| GET    | `/jobs/:id`              | Get a specific job (status + recent log tail).                       |
| GET    | `/jobs/:id/logs`         | Full log lines for a job (query `?tail=N` for last N).               |
| GET    | `/checkpoint`            | Read the current on-disk checkpoint (project-level state).           |

All build/resume requests return **immediately** with a job ID. The orchestrator
runs in the background; poll `/jobs/:id` for progress.

## Run

```bash
cd /home/swarm/spec2/skills/spec2-api
npm install
npm run build

# Default port 3737, override via PORT env var
PORT=3737 npm start
```

The main spec2 skill must be built (`cd ../spec2 && npm run build`).

## Quick example

```bash
# Start a build
curl -X POST http://localhost:3737/builds \
  -H 'Content-Type: application/json' \
  -d '{"requirements":"URL shortener with rate limiting","language":"typescript"}'
# → {"jobId":"abc-123","status":"queued"}

# Poll status
curl http://localhost:3737/jobs/abc-123
# → {"id":"abc-123","status":"running","phase":"wave2","progress":"..."}

# Stream logs
curl http://localhost:3737/jobs/abc-123/logs
```

## Environment

Inherits `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`,
`SPEC2_TESTING_MODE`. The server binds to `127.0.0.1` by default — override with
`HOST=0.0.0.0` only if you need external access (not recommended; no auth layer).

## No authentication

By design, this API has **no auth**. It is intended for localhost automation and
trusted networks only. Don't expose it to the internet.

## Agent isolation

The HTTP transport is a pass-through — it does not alter the isolation contract.
See `spec2/ROADMAP.md §1` for the isolation invariants.
