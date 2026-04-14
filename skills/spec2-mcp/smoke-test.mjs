#!/usr/bin/env node
/**
 * Smoke test: spawn the MCP server as a subprocess, speak JSON-RPC over stdio,
 * verify the tool surface and basic tool calls work.
 *
 * Run: node smoke-test.mjs
 * Exit code: 0 on success, non-zero on failure.
 */

import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(HERE, 'dist', 'server.js');

function fail(msg, detail) {
  console.error(`\n❌ FAIL: ${msg}`);
  if (detail !== undefined) console.error('  detail:', JSON.stringify(detail, null, 2));
  process.exit(1);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

/**
 * Minimal JSON-RPC over stdio client. Sends a request, resolves on the
 * matching response id.
 */
class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();

    proc.stdout.on('data', chunk => {
      this.buffer += chunk.toString();
      let idx;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve: r, reject: rj } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) rj(new Error(`RPC error: ${msg.error.message}`));
            else r(msg.result);
          }
        } catch (e) {
          // Non-JSON stderr from server might leak here if stderr → stdout; ignore
        }
      }
    });
  }

  send(method, params) {
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method}`));
        }
      }, 10_000);
    });
  }

  notify(method, params) {
    const msg = { jsonrpc: '2.0', method, params };
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }
}

async function run() {
  const tmp = mkdtempSync(join(tmpdir(), 'spec2-mcp-smoke-'));
  const originalCwd = process.cwd();
  process.chdir(tmp);

  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: tmp,
  });

  // Capture stderr but don't print unless debug
  proc.stderr.on('data', chunk => {
    if (process.env.MCP_SMOKE_DEBUG) {
      process.stderr.write(`[server stderr] ${chunk}`);
    }
  });

  const client = new McpClient(proc);

  try {
    // 1. Initialize handshake — MCP requires this before tool calls
    {
      const res = await client.send('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '0.0.1' },
      });
      if (!res.serverInfo?.name) fail('initialize missing serverInfo', res);
      pass(`initialize handshake (server=${res.serverInfo.name})`);
      // Send initialized notification (required by spec)
      client.notify('notifications/initialized', {});
    }

    // 2. List tools
    let tools;
    {
      const res = await client.send('tools/list', {});
      if (!Array.isArray(res.tools)) fail('tools/list not array', res);
      tools = res.tools.map(t => t.name);
      const expected = ['spec2_build', 'spec2_resume', 'spec2_status', 'spec2_jobs', 'spec2_logs'];
      for (const e of expected) {
        if (!tools.includes(e)) fail(`tools/list missing ${e}`, tools);
      }
      pass(`tools/list returns ${tools.length} tools: ${tools.join(', ')}`);
    }

    // 3. spec2_status with no checkpoint and no jobId
    {
      const res = await client.send('tools/call', {
        name: 'spec2_status',
        arguments: {},
      });
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.status !== 'no_checkpoint') fail('spec2_status no_checkpoint', parsed);
      pass('spec2_status returns no_checkpoint when none exists');
    }

    // 4. spec2_resume with no checkpoint
    {
      const res = await client.send('tools/call', {
        name: 'spec2_resume',
        arguments: {},
      });
      if (!res.isError) fail('spec2_resume should error when no checkpoint', res);
      pass('spec2_resume errors when no checkpoint (as designed)');
    }

    // 5. spec2_build with missing requirements
    {
      const res = await client.send('tools/call', {
        name: 'spec2_build',
        arguments: {},
      });
      if (!res.isError) fail('spec2_build should error on missing requirements', res);
      pass('spec2_build errors without requirements');
    }

    // 6. spec2_build with valid args — should return jobId
    let jobId;
    {
      const res = await client.send('tools/call', {
        name: 'spec2_build',
        arguments: { requirements: 'echo service', language: 'typescript' },
      });
      if (res.isError) fail('spec2_build failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (!parsed.jobId) fail('spec2_build missing jobId', parsed);
      jobId = parsed.jobId;
      pass(`spec2_build returns jobId (${jobId.slice(0, 8)}...)`);
    }

    // 7. spec2_status with jobId
    {
      const res = await client.send('tools/call', {
        name: 'spec2_status',
        arguments: { jobId },
      });
      if (res.isError) fail('spec2_status(jobId) failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.id !== jobId) fail('spec2_status wrong id', parsed);
      if (!['queued', 'running', 'failed', 'completed'].includes(parsed.status)) {
        fail('spec2_status bad status', parsed);
      }
      pass(`spec2_status(jobId) returns job (status=${parsed.status})`);
    }

    // 8. spec2_jobs
    {
      const res = await client.send('tools/call', {
        name: 'spec2_jobs',
        arguments: {},
      });
      if (res.isError) fail('spec2_jobs failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.count < 1) fail('spec2_jobs empty', parsed);
      pass(`spec2_jobs lists ${parsed.count} job(s)`);
    }

    // 9. spec2_logs
    {
      const res = await client.send('tools/call', {
        name: 'spec2_logs',
        arguments: { jobId, tail: 3 },
      });
      if (res.isError) fail('spec2_logs failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (!Array.isArray(parsed.logs)) fail('spec2_logs not array', parsed);
      pass(`spec2_logs returns logs (${parsed.returned}/${parsed.totalLines})`);
    }

    // 10. Write a checkpoint, try spec2_resume
    {
      mkdirSync('.spec2/checkpoints', { recursive: true });
      writeFileSync(
        '.spec2/checkpoints/latest.json',
        JSON.stringify({
          phase: 'wave2',
          timestamp: new Date().toISOString(),
          requirements: 'test',
          language: 'typescript',
          systemSpec: 'x',
          subsystems: [],
          subsystemSpecs: {},
        }),
      );
      const res = await client.send('tools/call', {
        name: 'spec2_resume',
        arguments: {},
      });
      if (res.isError) fail('spec2_resume with checkpoint failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (!parsed.jobId) fail('spec2_resume missing jobId', parsed);
      if (parsed.resumingFrom !== 'wave2') fail('spec2_resume wrong phase', parsed);
      pass('spec2_resume with wave2 checkpoint starts resume job');
    }

    // 11. spec2_resume when complete
    {
      writeFileSync(
        '.spec2/checkpoints/latest.json',
        JSON.stringify({
          phase: 'complete',
          timestamp: new Date().toISOString(),
          requirements: 'test',
          language: 'typescript',
        }),
      );
      const res = await client.send('tools/call', {
        name: 'spec2_resume',
        arguments: {},
      });
      if (res.isError) fail('spec2_resume(complete) unexpected error', res);
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.status !== 'already_complete') {
        fail('spec2_resume(complete) wrong status', parsed);
      }
      pass('spec2_resume returns already_complete for finished build');
    }

    // 12a. spec2_check_tests — hollow code
    {
      const res = await client.send('tools/call', {
        name: 'spec2_check_tests',
        arguments: {
          code: `it('trivial', () => { expect(1).toBe(1); });`,
          language: 'typescript',
        },
      });
      if (res.isError) fail('spec2_check_tests failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (parsed.passed) fail('spec2_check_tests should flag tautological', parsed);
      const rules = (parsed.issues || []).map(i => i.rule);
      if (!rules.includes('tautological_assertion')) {
        fail('spec2_check_tests missing tautological_assertion', parsed);
      }
      pass('spec2_check_tests flags hollow test');
    }

    // 12b. spec2_check_tests — healthy code
    {
      const res = await client.send('tools/call', {
        name: 'spec2_check_tests',
        arguments: {
          code: `it('real', () => { const x = compute(); expect(x).toBeGreaterThan(0); });`,
          language: 'typescript',
        },
      });
      if (res.isError) fail('spec2_check_tests healthy failed', res);
      const parsed = JSON.parse(res.content[0].text);
      if (!parsed.passed) fail('spec2_check_tests should pass healthy', parsed);
      pass('spec2_check_tests passes healthy test');
    }

    // 13. Unknown tool — MCP protocol says this should surface as RPC-level error
    {
      let threw = false;
      try {
        await client.send('tools/call', {
          name: 'spec2_bogus',
          arguments: {},
        });
      } catch (err) {
        threw = true;
        if (!String(err.message).includes('Unknown tool')) {
          fail('Unknown tool error wrong message', err.message);
        }
      }
      if (!threw) fail('Unknown tool should trigger RPC error', null);
      pass('Unknown tool name surfaces RPC-level error (correct per MCP spec)');
    }

    console.log('\n✅ All MCP smoke checks passed.');
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
    proc.kill('SIGTERM');
    setImmediate(() => process.exit(0));
  }
}

run().catch(err => {
  console.error('\n❌ Smoke test threw:', err);
  process.exit(1);
});
