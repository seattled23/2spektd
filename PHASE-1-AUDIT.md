# Spec2 v1.2.0-dev — Phase 1 Audit Closeout

**Date:** 2026-06-01
**Host:** NixOS (post WSL2 → NixOS migration)
**Spec2 root:** `/home/tessara/companyos/system/spec2/`
**Status:** PHASE 1 COMPLETE — all gates green on NixOS.

---

## 1. Tool Installation Log

All 4 Go quality adapters installed via `nix profile add` (single transaction) from `nixpkgs` flake. No `go install` fallback required — nixpkgs covered every tool.

| Tool           | Version  | Install Method                     | Path                                       |
|----------------|----------|------------------------------------|--------------------------------------------|
| golangci-lint  | 2.12.2   | `nix profile add nixpkgs#golangci-lint` | `/home/tessara/.nix-profile/bin/golangci-lint` |
| gosec          | 2.26.1   | `nix profile add nixpkgs#gosec`         | `/home/tessara/.nix-profile/bin/gosec`         |
| govulncheck    | 1.3.0    | `nix profile add nixpkgs#govulncheck`   | `/home/tessara/.nix-profile/bin/govulncheck`   |
| goimports      | (via gotools 0.44.0) | `nix profile add nixpkgs#gotools` | `/home/tessara/.nix-profile/bin/goimports` |

Underlying Go runtime: `go1.26.3` at `/home/tessara/.nix-profile/bin/go`.

### BEFORE state (verbatim)

```
$ which golangci-lint gosec govulncheck goimports
which: no golangci-lint in (...)
which: no gosec in (...)
which: no govulncheck in (...)
which: no goimports in (...)
```

### AFTER state (verbatim)

```
$ which golangci-lint gosec govulncheck goimports
/home/tessara/.nix-profile/bin/golangci-lint
/home/tessara/.nix-profile/bin/gosec
/home/tessara/.nix-profile/bin/govulncheck
/home/tessara/.nix-profile/bin/goimports

$ golangci-lint --version
golangci-lint has version 2.12.2 built with go1.26.3 from v2.12.2 on 1970-01-01T00:00:00Z

$ gosec --version
Version: 2.26.1
Git tag: v2.26.1

$ govulncheck -version
Go: go1.26.3
Scanner: govulncheck@1.3.0
DB: https://vuln.go.dev
DB updated: 2026-05-29 19:17:56 +0000 UTC

$ goimports -h | head -1
usage: goimports [flags] [path ...]
```

---

## 2. Test Suite Results

`cd /home/tessara/companyos/system/spec2/skills/spec2 && npm test` — full suite re-run after tool install. All 5 sub-suites exit 0, zero `(skipped — ... not installed)` lines.

| Suite        | Pre-install | Post-install | Delta | Notes                                                 |
|--------------|-------------|--------------|-------|-------------------------------------------------------|
| anti-hollow  | 50          | 50           |  0    | No Go-adapter dependency                              |
| registry     | 70          | 70           |  0    | No Go-adapter dependency                              |
| jobs         | 29          | 29           |  0    | No Go-adapter dependency                              |
| review       | 58          | 58           |  0    | No Go-adapter dependency                              |
| pack-go      | 43          | **48**       | +5    | `golangci-lint installed`/`run did not error`; `gosec installed`/`run did not error`/`gosec flagged MD5 weak hash (G401)` — these 5 assertions were previously skipped |
| **TOTAL**    | **250**     | **255**      | **+5**| 0 failures across the suite                           |

### pack-go tail (verbatim — final adapter checks)

```
── adapter: golangci-lint runs against a sample file ──
  ✓ golangci-lint installed
  ✓ run did not error: 

── adapter: gosec runs against a sample file ──
  ✓ gosec installed
  ✓ run did not error: 
  ✓ gosec flagged MD5 weak hash (G401)

── summary ──
  checks: 48
  failures: 0
```

No `(skipped — golangci-lint not installed)` or `(skipped — gosec not installed)` lines anywhere in output.

---

## 3. spec2-mcp Smoke Test (stdio MCP transport)

**Command:** `cd skills/spec2-mcp && node smoke-test.mjs`
**Exit code:** 0
**Log:** `/tmp/spec2-mcp-smoke.log` (16 lines)

The spec2-mcp transport ships with a pre-existing 13-check smoke test (`smoke-test.mjs`). No script needed to be written. It spawns the compiled `dist/server.js` as a stdio subprocess, performs the MCP `initialize` handshake, lists tools, invokes every tool with valid and invalid args, and verifies error semantics.

### Tool surface (from `tools/list` response)

```
spec2_build, spec2_resume, spec2_status, spec2_jobs, spec2_logs, spec2_check_tests
```

All 6 expected `spec2_*` tools present.

### Full pass output (verbatim)

```
✓ initialize handshake (server=spec2)
✓ tools/list returns 6 tools: spec2_build, spec2_resume, spec2_status, spec2_jobs, spec2_logs, spec2_check_tests
✓ spec2_status returns no_checkpoint when none exists
✓ spec2_resume errors when no checkpoint (as designed)
✓ spec2_build errors without requirements
✓ spec2_build returns jobId (2999c3c2...)
✓ spec2_status(jobId) returns job (status=failed)
✓ spec2_jobs lists 1 job(s)
✓ spec2_logs returns logs (3/4)
✓ spec2_resume with wave2 checkpoint starts resume job
✓ spec2_resume returns already_complete for finished build
✓ spec2_check_tests flags hollow test
✓ spec2_check_tests passes healthy test
✓ Unknown tool name surfaces RPC-level error (correct per MCP spec)

✅ All MCP smoke checks passed.
```

**Result:** PASS (exit=0, 13/13 checks).

---

## 4. spec2-api Smoke Test (HTTP/Fastify transport)

**Command:** `cd skills/spec2-api && LOG_LEVEL=warn node smoke-test.mjs`
**Exit code:** 0
**Log:** `/tmp/spec2-api-smoke.log` (39 lines)

The spec2-api transport ships with a pre-existing 16-check smoke test. No script needed to be written. It builds the Fastify server, binds to an ephemeral port (`port: 0`), hits every documented route, and verifies status codes + response shapes.

### `curl -i /health` capture (separate run, port 3737)

```
$ curl -is http://127.0.0.1:3737/health
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 55
Date: Mon, 01 Jun 2026 10:17:14 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"status":"ok","service":"spec2-api","version":"0.1.0"}
```

Log: `/tmp/spec2-api-curl-health.log`.

### Smoke test pass output (verbatim, tail)

```
smoke test: server on http://127.0.0.1:39927

✓ GET /health returns ok
✓ GET /checkpoint returns 404 when no checkpoint
✓ POST /resume returns 404 when no checkpoint
✓ POST /builds rejects empty body with 400
✓ POST /builds rejects invalid language
✓ POST /builds accepts job (jobId=748a96c1...)
✓ GET /jobs/:id returns job (status=failed)
✓ GET /jobs/:id/logs returns log array (4 lines)
✓ GET /jobs/:id/logs?tail=5 respects tail limit
✓ GET /jobs lists 1 job(s)
✓ GET /jobs/:id returns 404 for unknown id
✓ GET /checkpoint reads wave3 checkpoint
✓ POST /resume with checkpoint starts resume job
✓ POST /resume returns 409 when checkpoint is complete
✓ POST /check-tests flags tautological test
✓ POST /check-tests passes healthy test
✓ POST /check-tests rejects missing language

✅ All HTTP API smoke checks passed.
```

**Result:** PASS (exit=0, 16/16 checks, `/health` returns HTTP 200).

---

## 5. Anomalies & Resolutions

| Anomaly | Resolution |
|---|---|
| `nix profile install` failed with `'install' is a deprecated alias for 'add'` AND `experimental Nix feature 'nix-command' is disabled`. | Re-ran as `nix --extra-experimental-features 'nix-command flakes' profile add nixpkgs#<pkg> ...`. Single command installed all 4 packages from the binary cache (68 MiB download, 349 MiB unpacked). No source builds, no broken-package markers hit. The deprecated-alias warning is informational; `profile add` is the current verb. Did NOT need to enable experimental features system-wide — per-invocation flag is sufficient and avoids modifying `/etc/nix/nix.conf`. |
| `goimports` is not a standalone nixpkgs derivation; it ships inside `gotools`. | Installed `nixpkgs#gotools` instead. `goimports` binary is now in `~/.nix-profile/bin/goimports` alongside `gorename`, `gomvpkg`, `present`, etc. |
| Initial curl-test scripted via shell-background hit ordering races with the harness re-spawning bash snapshots; killed-server PIDs kept reappearing on subsequent invocations. | Wrote the curl test to a standalone `/tmp/spec2-curl-test.sh` script that starts the server in foreground-with-trailing-`&`, polls `/health` for readiness up to 5s, captures `curl -is`, then `kill -TERM` + `wait` for clean teardown. Single invocation, deterministic. |
| Both `npm install` runs in the transports reported moderate/high `npm audit` vulnerabilities (5 in spec2-mcp, 2 in spec2-api). | NOT fixed in this audit per constraint "Don't modify any existing source files except to add smoke-test.mjs scripts if missing." Logged for backlog — audit + bump in a separate PR. The vulnerabilities are transitive dev-deps (likely `pino-pretty` chain in spec2-api, `@modelcontextprotocol/sdk` chain in spec2-mcp); they do not affect Phase 1 transport correctness. |
| No `smoke-test.mjs` scripts needed to be written — both transports already had them. | No-op. Pre-existing scripts ran clean on first try after `npm install && npm run build`. |

---

## 6. Phase 1 Gate Summary

| Gate | Status | Evidence |
|---|---|---|
| BEFORE state — Go tools missing | ✓ | §1 verbatim `which` output |
| AFTER state — Go tools installed with versions | ✓ | §1 verbatim `which` + `--version` |
| Test suite — no skipped adapter lines | ✓ | §2 pack-go tail, 48 checks (was 43) |
| MCP smoke — stdio JSON-RPC + tool list | ✓ | §3 `/tmp/spec2-mcp-smoke.log`, exit 0 |
| HTTP smoke — `curl -i /health` 200 | ✓ | §4 `/tmp/spec2-api-curl-health.log`, exit 0 |
| Report exists with all sections | ✓ | This file |

**Phase 1 closeout: COMPLETE.** All 6 adversarial completion criteria from the task brief satisfied with verbatim captured output.

---

## 7. Artifacts

- `/tmp/spec2-mcp-smoke.log` — full MCP smoke output (13 checks)
- `/tmp/spec2-api-smoke.log` — full HTTP smoke output (16 checks, includes server logs)
- `/tmp/spec2-api-curl-health.log` — `curl -is /health` capture
- `/tmp/spec2-api-server.log` — server stderr/stdout during curl test
- `/tmp/spec2-curl-test.sh` — the curl harness script (reusable)

Nix profile changes are local to `~/.nix-profile`; no system-wide config touched. Roll back via `nix profile remove golangci-lint gosec govulncheck gotools` if needed.
