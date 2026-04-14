# Archived design docs

**Archived:** 2026-04-13 (at the v1.2.0-dev milestone)

These files are **historical design documents** from earlier phases of spec2 —
pre-wave-architecture and pre-v1.1. They are kept here for historical context
and so that anyone tracing design decisions can see how the project evolved.

## Do not use these as a reference for current work

Every file in this directory describes an architecture that **no longer exists**:

- They describe a **12-layer validator only** pipeline (what shipped in v1.0.0).
  The v1.1.0 refactor replaced the orchestration around that validator with a
  **6-wave generation pipeline** with per-wave validators and regeneration
  loops. The 12-layer validator is still in the tree (under `validation/`),
  but it is now one piece of a larger system, not the whole system.
- They reference an older intake path (`/spec2:new`, `/spec2:upgrade`) and do
  **not** cover the current transports (`/spec2-new` slash command, MCP server
  `spec2_build`/`spec2_resume`, HTTP `POST /builds`).
- They predate **resume from checkpoint**, the **anti-hollow test detector**,
  the **MCP and HTTP transports**, and the **agent-isolation contract** as it
  is currently enforced.
- Several files use the legacy `2spektd` name for the project (pre-rename).

Claims made in these documents about "production readiness," layer counts,
validation gates, or agent wiring **should not be trusted** as statements
about the current system.

## Authoritative current docs

Use these instead:

| Doc                                   | Purpose                                                    |
|---------------------------------------|------------------------------------------------------------|
| `../../ROADMAP.md`                    | What's shipped, what's next, what's deferred, and why.     |
| `../../CHANGELOG.md`                  | Release history (v1.0.0 → v1.1.0 → v1.2.0-dev).            |
| `../../IMPLEMENTATION_STATUS.md`      | Current implementation status snapshot.                    |
| `../../README.md`                     | Project overview and entry points.                         |
| `../../skills/spec2-mcp/SKILL.md`     | MCP transport reference.                                   |
| `../../skills/spec2-api/SKILL.md`     | HTTP transport reference.                                  |

## What's in here

| File                                    | Original purpose                                       |
|-----------------------------------------|--------------------------------------------------------|
| `MVP_IMPLEMENTATION_STATUS.md`          | Pre-wave MVP progress tracker.                         |
| `MVP_STATUS_FINAL.md`                   | MVP sign-off notes.                                    |
| `PHASE_A_FINAL_PLAN.md`                 | Phase A (pre-wave) build plan.                         |
| `PHASE_A_IMPROVEMENTS.md`               | Phase A change proposals.                              |
| `IMPLEMENTATION-COMPLETE.md`            | Early "we're done" memo for an older scope.            |
| `2SPEKTD_INTEGRATION_ANALYSIS.md`       | Analysis using the pre-rename project name.            |
| `2SPEKTD_WORKFLOW_VISUAL.md`            | Workflow diagrams using the pre-rename project name.   |
| `VERIFICATION_CHECKPOINTS.md`           | Early design of the verification story.                |
| `VERIFICATION_INTEGRATION_VISUAL.md`    | Diagrams paired with the above.                        |
| `IMPROVEMENTS_VISUAL.md`                | Visual change log for a superseded phase.              |
| `SESSION_CONTEXT.md`                    | Scratchpad from a work session.                        |
| `SESSION_SUMMARY.md`                    | Scratchpad from a work session.                        |
| `STATUS.md`                             | Superseded by `../../IMPLEMENTATION_STATUS.md`.        |
| `QUICK_START.txt`                       | Pre-wave quick-start, now wrong.                       |
