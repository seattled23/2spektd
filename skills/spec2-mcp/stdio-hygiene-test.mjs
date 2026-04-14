#!/usr/bin/env node
/**
 * stdio-hygiene-test — verify the MCP server's stdout contains ONLY valid
 * JSON-RPC messages, even while a background job is running.
 *
 * This is the test that would have caught the console.log-tees-to-stdout bug.
 * Per MCP spec:
 *   "Implementations MUST NOT write any data to stdout that is not a valid
 *    JSON-RPC message."
 *
 * Run: node stdio-hygiene-test.mjs
 * Exit code: 0 if stdout is clean, non-zero if ANY non-JSON line is seen.
 */

import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(HERE, 'dist', 'server.js');

const tmp = mkdtempSync(join(tmpdir(), 'spec2-mcp-hygiene-'));

const proc = spawn('node', [SERVER_PATH], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: tmp,
  env: { ...process.env },
});

const stdoutLines = [];
const stderrLines = [];
const violations = [];

let buffer = '';
proc.stdout.on('data', chunk => {
  buffer += chunk.toString();
  while (true) {
    const idx = buffer.indexOf('\n');
    if (idx < 0) break;
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    stdoutLines.push(line);
    try {
      const msg = JSON.parse(line);
      if (typeof msg !== 'object' || msg === null) {
        violations.push({ line, reason: 'Parsed JSON is not an object' });
      } else if (msg.jsonrpc !== '2.0') {
        violations.push({ line, reason: 'Missing or wrong jsonrpc field' });
      }
    } catch (e) {
      violations.push({ line, reason: 'Not valid JSON' });
    }
  }
});

proc.stderr.on('data', chunk => {
  stderrLines.push(chunk.toString());
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  return id;
}

function notify(method, params) {
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  // Initialize
  rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'hygiene', version: '0.0.1' },
  });
  await sleep(200);
  notify('notifications/initialized', {});
  await sleep(100);

  // Start a build — this will fire orchestrator console.log output
  rpc('tools/call', {
    name: 'spec2_build',
    arguments: { requirements: 'a', language: 'typescript' },
  });

  // Let the orchestrator run for a few seconds so its console.log output
  // has a chance to corrupt the stream (if the bug exists).
  await sleep(3000);

  proc.kill('SIGTERM');
  await sleep(200);
  rmSync(tmp, { recursive: true, force: true });

  console.log(`Total stdout lines: ${stdoutLines.length}`);
  console.log(`Total stderr lines: ${stderrLines.length}`);
  console.log(`Violations: ${violations.length}`);

  if (violations.length > 0) {
    console.error('\n❌ STDIO HYGIENE VIOLATION');
    console.error('Non-JSON-RPC lines found on stdout (corrupts MCP stream):');
    for (const v of violations.slice(0, 10)) {
      console.error(`  [${v.reason}] ${v.line.slice(0, 120)}`);
    }
    if (violations.length > 10) {
      console.error(`  ... and ${violations.length - 10} more violations`);
    }
    process.exit(1);
  }

  console.log('\n✅ stdout contained only valid JSON-RPC messages');
  process.exit(0);
}

run().catch(err => {
  console.error('Test threw:', err);
  proc.kill('SIGTERM');
  process.exit(2);
});
