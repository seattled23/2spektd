#!/usr/bin/env node
/**
 * Smoke test: start the HTTP API, hit every endpoint, verify shape.
 * Does not make real LLM calls — builds are queued, then we inspect
 * routing + job tracking without waiting for completion.
 *
 * Run: node smoke-test.mjs
 * Exit code: 0 on success, non-zero on failure.
 */

import { buildServer } from './dist/server.js';
import { spawnSync } from 'child_process';

let app;
let port;

function fail(msg, detail) {
  console.error(`\n❌ FAIL: ${msg}`);
  if (detail !== undefined) console.error('  detail:', detail);
  process.exit(1);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

async function req(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function run() {
  // Start server on a random free port
  app = await buildServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  port = typeof addr === 'object' && addr ? addr.port : 3737;
  console.log(`smoke test: server on http://127.0.0.1:${port}\n`);

  // Use a temp cwd so we don't pollute the real .spec2
  const { mkdtempSync, rmSync } = await import('fs');
  const { tmpdir } = await import('os');
  const tmpDir = mkdtempSync(`${tmpdir()}/spec2-smoke-`);
  const originalCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    // 1. /health
    {
      const r = await req('GET', '/health');
      if (r.status !== 200) fail('GET /health status', r);
      if (r.body?.status !== 'ok') fail('GET /health body', r);
      pass('GET /health returns ok');
    }

    // 2. /checkpoint with no checkpoint
    {
      const r = await req('GET', '/checkpoint');
      if (r.status !== 404) fail('GET /checkpoint (missing) expected 404', r);
      if (r.body?.error !== 'no_checkpoint') fail('GET /checkpoint error code', r);
      pass('GET /checkpoint returns 404 when no checkpoint');
    }

    // 3. /resume with no checkpoint
    {
      const r = await req('POST', '/resume');
      if (r.status !== 404) fail('POST /resume (no checkpoint) expected 404', r);
      pass('POST /resume returns 404 when no checkpoint');
    }

    // 4. /builds missing body
    {
      const r = await req('POST', '/builds', {});
      if (r.status !== 400) fail('POST /builds (empty) expected 400', r);
      pass('POST /builds rejects empty body with 400');
    }

    // 5. /builds invalid language
    {
      const r = await req('POST', '/builds', {
        requirements: 'x',
        language: 'cobol',
      });
      if (r.status !== 400) fail('POST /builds (bad lang) expected 400', r);
      pass('POST /builds rejects invalid language');
    }

    // 6. /builds valid — should accept and return jobId.
    //    The job will fail immediately (no API keys), which is fine; we're
    //    only testing the acceptance + routing, not execution.
    let jobId;
    {
      const r = await req('POST', '/builds', {
        requirements: 'Build a trivial echo service',
        language: 'typescript',
      });
      if (r.status !== 202) fail('POST /builds status', r);
      if (!r.body?.jobId) fail('POST /builds missing jobId', r);
      if (r.body?.status !== 'queued' && r.body?.status !== 'running') {
        fail('POST /builds status field', r);
      }
      jobId = r.body.jobId;
      pass(`POST /builds accepts job (jobId=${jobId.slice(0, 8)}...)`);
    }

    // 7. /jobs/:id
    {
      const r = await req('GET', `/jobs/${jobId}`);
      if (r.status !== 200) fail('GET /jobs/:id status', r);
      if (r.body?.id !== jobId) fail('GET /jobs/:id id mismatch', r);
      if (!['queued', 'running', 'failed', 'completed'].includes(r.body?.status)) {
        fail('GET /jobs/:id bad status', r);
      }
      pass(`GET /jobs/:id returns job (status=${r.body.status})`);
    }

    // 8. /jobs/:id/logs
    {
      const r = await req('GET', `/jobs/${jobId}/logs`);
      if (r.status !== 200) fail('GET /jobs/:id/logs status', r);
      if (!Array.isArray(r.body?.logs)) fail('GET /jobs/:id/logs logs not array', r);
      pass(`GET /jobs/:id/logs returns log array (${r.body.totalLines} lines)`);
    }

    // 9. /jobs/:id/logs?tail=5
    {
      const r = await req('GET', `/jobs/${jobId}/logs?tail=5`);
      if (r.status !== 200) fail('GET /jobs/:id/logs?tail status', r);
      if ((r.body?.logs?.length ?? 99) > 5) fail('GET logs?tail=5 over limit', r);
      pass('GET /jobs/:id/logs?tail=5 respects tail limit');
    }

    // 10. /jobs
    {
      const r = await req('GET', '/jobs');
      if (r.status !== 200) fail('GET /jobs status', r);
      if (!Array.isArray(r.body?.jobs)) fail('GET /jobs not array', r);
      if (r.body.count < 1) fail('GET /jobs empty', r);
      pass(`GET /jobs lists ${r.body.count} job(s)`);
    }

    // 11. /jobs/:id for unknown id
    {
      const r = await req('GET', '/jobs/does-not-exist');
      if (r.status !== 404) fail('GET /jobs/unknown expected 404', r);
      pass('GET /jobs/:id returns 404 for unknown id');
    }

    // 12. Write a fake checkpoint and hit /checkpoint + /resume
    {
      const { mkdirSync, writeFileSync } = await import('fs');
      mkdirSync('.spec2/checkpoints', { recursive: true });
      writeFileSync(
        '.spec2/checkpoints/latest.json',
        JSON.stringify({
          phase: 'wave3',
          timestamp: new Date().toISOString(),
          requirements: 'test',
          language: 'typescript',
          systemSpec: 'x',
          subsystems: [],
          subsystemSpecs: {},
          components: [],
          componentSpecs: {},
        }),
      );

      const cp = await req('GET', '/checkpoint');
      if (cp.status !== 200) fail('GET /checkpoint with file expected 200', cp);
      if (cp.body?.phase !== 'wave3') fail('GET /checkpoint phase', cp);
      if (cp.body?.canResume !== true) fail('GET /checkpoint canResume', cp);
      pass('GET /checkpoint reads wave3 checkpoint');

      const resume = await req('POST', '/resume');
      if (resume.status !== 202) fail('POST /resume with checkpoint', resume);
      if (!resume.body?.jobId) fail('POST /resume missing jobId', resume);
      if (resume.body?.resumingFrom !== 'wave3') {
        fail('POST /resume wrong resumingFrom', resume);
      }
      pass(`POST /resume with checkpoint starts resume job`);
    }

    // 13. /resume when checkpoint is complete
    {
      const { writeFileSync } = await import('fs');
      writeFileSync(
        '.spec2/checkpoints/latest.json',
        JSON.stringify({
          phase: 'complete',
          timestamp: new Date().toISOString(),
          requirements: 'test',
          language: 'typescript',
        }),
      );
      const r = await req('POST', '/resume');
      if (r.status !== 409) fail('POST /resume (complete) expected 409', r);
      pass('POST /resume returns 409 when checkpoint is complete');
    }

    // 14. POST /check-tests — hollow code rejected
    {
      const r = await req('POST', '/check-tests', {
        code: `it('trivial', () => { expect(1).toBe(1); });`,
        language: 'typescript',
      });
      if (r.status !== 200) fail('POST /check-tests status', r);
      if (r.body?.passed) fail('/check-tests should flag tautological', r.body);
      const rules = (r.body?.issues || []).map(i => i.rule);
      if (!rules.includes('tautological_assertion')) {
        fail('/check-tests missing tautological_assertion', r.body);
      }
      pass('POST /check-tests flags tautological test');
    }

    // 15. POST /check-tests — healthy code passes
    {
      const r = await req('POST', '/check-tests', {
        code: `it('real', () => { const x = compute(); expect(x).toBeGreaterThan(0); });`,
        language: 'typescript',
      });
      if (r.status !== 200) fail('POST /check-tests healthy status', r);
      if (!r.body?.passed) fail('/check-tests should pass healthy code', r.body);
      pass('POST /check-tests passes healthy test');
    }

    // 16. POST /check-tests — missing body rejected
    {
      const r = await req('POST', '/check-tests', { code: 'x' });
      if (r.status !== 400) fail('POST /check-tests missing lang expected 400', r);
      pass('POST /check-tests rejects missing language');
    }

    console.log('\n✅ All HTTP API smoke checks passed.');
  } finally {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    await app.close();
    // Orphan background jobs may still be running (they'll hit LLM retries
    // and eventually fail). Force exit so the test runner doesn't hang.
    setImmediate(() => process.exit(0));
  }
}

run().catch(err => {
  console.error('\n❌ Smoke test threw:', err);
  process.exit(1);
});
