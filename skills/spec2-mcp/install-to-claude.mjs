#!/usr/bin/env node
/**
 * install-to-claude — idempotent installer that adds spec2-mcp to the user's
 * Claude Code config at ~/.claude.json.
 *
 * - Preserves all existing mcpServers entries
 * - Refuses to overwrite an existing "spec2" entry without --force
 * - Writes an atomic backup to ~/.claude.json.backup-<timestamp> before touching
 *   the file, so the config is recoverable if anything goes wrong
 * - Prints the config snippet for Gemini CLI (user installs manually there)
 *
 * Usage:
 *   node install-to-claude.mjs          # install, abort if spec2 exists
 *   node install-to-claude.mjs --force  # overwrite existing spec2 entry
 *   node install-to-claude.mjs --print  # print snippet, don't modify file
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(HERE, 'dist', 'server.js');
const CLAUDE_CONFIG = resolve(homedir(), '.claude.json');
const GEMINI_CONFIG = resolve(homedir(), '.gemini', 'settings.json');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const printOnly = args.has('--print');

function buildSpec2Entry() {
  return {
    command: 'node',
    args: [SERVER_PATH],
  };
}

function warn(msg) {
  console.error(`⚠️  ${msg}`);
}
function info(msg) {
  console.log(`ℹ️  ${msg}`);
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// Pre-flight checks
if (!existsSync(SERVER_PATH)) {
  fail(
    `Compiled server not found at ${SERVER_PATH}\n` +
      `Run: cd ${HERE} && npm run build`,
  );
}

// Print-only mode: show snippets and exit
if (printOnly) {
  const entry = buildSpec2Entry();
  console.log('\n=== Claude Code (~/.claude.json) ===\n');
  console.log(JSON.stringify({ mcpServers: { spec2: entry } }, null, 2));
  console.log('\n=== Gemini CLI (~/.gemini/settings.json) ===\n');
  console.log(JSON.stringify({ mcpServers: { spec2: entry } }, null, 2));
  console.log(
    '\nAdd the "spec2" entry under your existing "mcpServers" map.\n',
  );
  process.exit(0);
}

// Install to ~/.claude.json
if (!existsSync(CLAUDE_CONFIG)) {
  fail(
    `~/.claude.json not found. Is Claude Code installed?\n` +
      `You can still run with --print to see the config snippet.`,
  );
}

let config;
try {
  config = JSON.parse(readFileSync(CLAUDE_CONFIG, 'utf8'));
} catch (err) {
  fail(`~/.claude.json is not valid JSON: ${err.message}`);
}

config.mcpServers = config.mcpServers ?? {};

if (config.mcpServers.spec2 && !force) {
  warn('~/.claude.json already has a "spec2" entry:');
  console.error(JSON.stringify(config.mcpServers.spec2, null, 2));
  fail('Use --force to overwrite, or remove the existing entry manually.');
}

// Backup before mutating
const backupPath = `${CLAUDE_CONFIG}.backup-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}`;
copyFileSync(CLAUDE_CONFIG, backupPath);
ok(`Backup: ${backupPath}`);

// List existing entries so the user can see we're preserving them
const existingKeys = Object.keys(config.mcpServers).filter(k => k !== 'spec2');
if (existingKeys.length > 0) {
  info(`Preserving existing mcpServers: ${existingKeys.join(', ')}`);
}

config.mcpServers.spec2 = buildSpec2Entry();

writeFileSync(CLAUDE_CONFIG, JSON.stringify(config, null, 2), 'utf8');
ok(`Installed spec2 MCP server entry to ${CLAUDE_CONFIG}`);

console.log('\nNext steps:');
console.log('  1. Restart Claude Code (the MCP server is loaded at session start).');
console.log('  2. From any Claude Code session, invoke a spec2 tool, e.g.:');
console.log('     "Use the spec2_status tool to check my project."');
console.log('  3. To test: run Claude Code in a directory with no .spec2/');
console.log('     directory. spec2_status should return {status: "no_checkpoint"}.');
console.log('\nGemini CLI: spec2-mcp works there too, but install manually.');
console.log('Run with --print to see the exact snippet.\n');
