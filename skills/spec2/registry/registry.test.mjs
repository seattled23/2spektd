#!/usr/bin/env node
/**
 * Unit tests for the Integration Registry.
 *
 * Runs against the compiled JS output (dist/registry/index.js).
 * Does NOT require API keys — pure SQLite + in-process logic.
 *
 * Run: node registry/registry.test.mjs
 * Exit code: 0 on success, non-zero on failure.
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(HERE, '../dist/registry/index.js');

let mod;
try {
  mod = await import(REGISTRY_PATH);
} catch (err) {
  console.error(`❌ Cannot import registry module from ${REGISTRY_PATH}`);
  console.error('   Did you run `npx tsc` first?');
  console.error('  ', err.message);
  process.exit(1);
}

const { IntegrationRegistry, parseComponentSpec, initRegistry, getRegistry, ingestComponent, getAllFunctionSignatures, getSharedTypes, getCrossComponentLinks, getRegistrySummary } = mod;

let failures = 0;
let checks = 0;

function expect(cond, msg, ctx) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ❌ ${msg}`);
    if (ctx !== undefined) console.error('     ctx:', typeof ctx === 'string' ? ctx : JSON.stringify(ctx, null, 2));
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  FIXTURES
// ═══════════════════════════════════════════════════════════════════════

// Canonical Tier 3 component spec (follows the exact template from agents/tier3.ts)
const CANONICAL_SPEC = `
# Component: AuthManager

## Overview
Handles user authentication and session management. Validates credentials
and issues JWT tokens.

## Data Model

### Type: UserCredentials
\`\`\`
interface UserCredentials {
  username: string;
  password: string;
}
\`\`\`
**Purpose:** Input type for login operations.
**Validation Rules:**
- username must be non-empty
- password must be ≥8 chars

### Type: AuthToken
\`\`\`
interface AuthToken {
  token: string;
  expiresAt: number;
  userId: string;
}
\`\`\`
**Purpose:** JWT token issued on successful authentication.

## Functions

### \`login(credentials: UserCredentials) → AuthToken\`
**Purpose:** Validate credentials and return a signed JWT.
**@pre:** credentials.username non-empty, credentials.password ≥8 chars
**@post:** Returns valid AuthToken with expiresAt in the future
**@error:**
- InvalidCredentials: wrong username or password
- RateLimitExceeded: too many failed attempts

### \`logout(token: string) → void\`
**Purpose:** Invalidate an existing session token.
**@pre:** token is a valid JWT issued by this service
**@post:** Token is invalidated, subsequent calls with same token fail
**@error:**
- InvalidToken: token is malformed or already expired

### \`validateToken(token: string) → boolean\`
**Purpose:** Check whether a token is still valid.
**@pre:** token is non-empty string
**@post:** Returns true iff token is valid and unexpired
**@error:** None — returns false on any error condition

## Error Handling
Errors are returned as typed exceptions. Callers must catch InvalidCredentials
and RateLimitExceeded separately.

## Dependencies

**Imports (what this component needs):**
- From: [UserStore] | What: [lookupUser(username) → User] | Contract: returns User or null
- From: [TokenStore] | What: [revokeToken(token)] | Contract: marks token as revoked

**Exports (what this component provides):**
- login(credentials: UserCredentials) → AuthToken
- logout(token: string) → void
- validateToken(token: string) → boolean
`;

// Second component that imports from AuthManager (creates a cross-component link)
const SECOND_SPEC = `
# Component: ApiGateway

## Overview
Routes incoming HTTP requests to the appropriate backend services.

## Data Model

### Type: RequestContext
\`\`\`
interface RequestContext {
  userId: string;
  path: string;
  method: string;
}
\`\`\`
**Purpose:** Context passed to downstream handlers.

### Type: AuthToken
\`\`\`
interface AuthToken {
  token: string;
  expiresAt: number;
  userId: string;
}
\`\`\`
**Purpose:** JWT token validated on each request.

## Functions

### \`routeRequest(req: IncomingRequest) → Response\`
**Purpose:** Route an incoming HTTP request after validating auth.
**@pre:** req.headers.authorization is present
**@post:** Returns Response from the appropriate downstream handler
**@error:**
- Unauthorized: token invalid or missing
- NotFound: no route matches

### \`healthCheck() → HealthStatus\`
**Purpose:** Return current gateway health status.
**@pre:** None
**@post:** Returns HealthStatus object
**@error:** None

## Dependencies

**Imports (what this component needs):**
- From: [AuthManager] | What: [validateToken(token: string) → boolean] | Contract: returns bool
- From: [RouteRegistry] | What: [findRoute(path, method) → Handler] | Contract: returns Handler or null

**Exports (what this component provides):**
- routeRequest(req: IncomingRequest) → Response
- healthCheck() → HealthStatus
`;

// Minimal / malformed spec — triggers warnings but must not crash
const MALFORMED_SPEC = `
# Component: WeirdThing

This component has no sections whatsoever.
`;

// Partially malformed — has functions but no dependencies
const PARTIAL_SPEC = `
# Component: DataStore

## Functions

### Function: saveRecord
**Purpose:** Persist a record to storage.
**@pre:** record is not null
**@post:** Record appears in storage
**@error:**
- StorageError: disk full

## Overview
Stores data.
`;

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

function makeTempDb() {
  const tmp = mkdtempSync(join(tmpdir(), 'spec2-reg-'));
  const dbPath = join(tmp, 'registry.db');
  return { tmp, dbPath };
}

function cleanup(tmp) {
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ═══════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════

// ── 1. Schema init idempotency ─────────────────────────────────────────
{
  console.log('\n── 1. Schema init idempotency ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const r1 = new IntegrationRegistry(dbPath);
    expect(r1.componentCount() === 0, 'Fresh registry has 0 components');

    // Re-initialize on same path — must not throw or corrupt
    r1.close();
    const r2 = new IntegrationRegistry(dbPath);
    expect(r2.componentCount() === 0, 'Re-init on existing db is idempotent');
    r2.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 2. Canonical Tier 3 spec parse ────────────────────────────────────
{
  console.log('\n── 2. Canonical spec parse ──');
  const parsed = parseComponentSpec(CANONICAL_SPEC);

  expect(parsed.warnings.length === 0, `No parse warnings for canonical spec (got: ${parsed.warnings.join('; ')})`, parsed.warnings);
  expect(parsed.functions.length >= 3, `≥3 functions parsed (got ${parsed.functions.length})`, parsed.functions.map(f => f.name));
  expect(parsed.functions.some(f => f.name === 'login'), 'login function found');
  expect(parsed.functions.some(f => f.name === 'logout'), 'logout function found');
  expect(parsed.functions.some(f => f.name === 'validateToken'), 'validateToken found');

  const loginFn = parsed.functions.find(f => f.name === 'login');
  expect(loginFn?.purpose?.length > 0, 'login has purpose', loginFn?.purpose);
  expect(loginFn?.preconditions?.length > 0, 'login has preconditions', loginFn?.preconditions);
  expect(loginFn?.errorCases?.length > 0, 'login has error cases', loginFn?.errorCases);

  expect(parsed.types.length >= 2, `≥2 types parsed (got ${parsed.types.length})`, parsed.types.map(t => t.name));
  expect(parsed.types.some(t => t.name === 'UserCredentials'), 'UserCredentials type found');
  expect(parsed.types.some(t => t.name === 'AuthToken'), 'AuthToken type found');

  expect(parsed.exports.length >= 2, `≥2 exports parsed (got ${parsed.exports.length})`, parsed.exports);
  expect(parsed.imports.length >= 2, `≥2 imports parsed (got ${parsed.imports.length})`, parsed.imports);

  const userStoreImport = parsed.imports.find(i => i.fromComponent === 'UserStore');
  expect(userStoreImport !== undefined, 'UserStore import found', parsed.imports);
}

// ── 3. Malformed spec — graceful degradation ───────────────────────────
{
  console.log('\n── 3. Malformed spec — graceful degradation ──');
  let parsed;
  expect(
    (() => { parsed = parseComponentSpec(MALFORMED_SPEC); return true; })(),
    'parseComponentSpec does not throw on malformed input'
  );
  expect(Array.isArray(parsed.warnings), 'warnings is an array');
  expect(parsed.warnings.length > 0, `Malformed spec has parse warnings (got ${parsed.warnings.length})`);
  expect(Array.isArray(parsed.functions), 'functions is always an array');
  expect(Array.isArray(parsed.types), 'types is always an array');
  expect(Array.isArray(parsed.exports), 'exports is always an array');
  expect(Array.isArray(parsed.imports), 'imports is always an array');
}

// ── 4. Partial spec — warnings but partial data ────────────────────────
{
  console.log('\n── 4. Partial spec — dependencies missing ──');
  const parsed = parseComponentSpec(PARTIAL_SPEC);
  expect(parsed.functions.length >= 1, `Partial spec: ≥1 function parsed (got ${parsed.functions.length})`, parsed.functions);
  expect(parsed.warnings.some(w => w.includes('Dependencies')), 'Warns about missing Dependencies section', parsed.warnings);
}

// ── 5. ingestComponent + componentCount ───────────────────────────────
{
  console.log('\n── 5. ingestComponent ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    expect(reg.componentCount() === 1, 'componentCount = 1 after first ingest');

    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);
    expect(reg.componentCount() === 2, 'componentCount = 2 after second ingest');

    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 6. Ingest idempotency (re-ingest replaces, no duplication) ─────────
{
  console.log('\n── 6. Ingest idempotency ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC); // re-ingest
    expect(reg.componentCount() === 1, 'Re-ingest does not duplicate component');

    const sigs = reg.getAllFunctionSignatures();
    // Match only entries where the function name portion is exactly "login"
    // (not type definitions that mention "login" in their purpose)
    const loginCount = sigs.filter(s => /AuthManager\.`?login\b/.test(s) || /AuthManager\.login\b/.test(s)).length;
    expect(loginCount === 1, `login function appears exactly once after re-ingest (got ${loginCount})`, sigs);
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 7. getAllFunctionSignatures ────────────────────────────────────────
{
  console.log('\n── 7. getAllFunctionSignatures ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);

    const sigs = reg.getAllFunctionSignatures();
    expect(sigs.length >= 5, `≥5 function signatures (got ${sigs.length})`, sigs);
    expect(sigs.some(s => s.startsWith('AuthManager.')), 'AuthManager functions prefixed correctly');
    expect(sigs.some(s => s.startsWith('ApiGateway.')), 'ApiGateway functions prefixed correctly');
    expect(sigs.every(s => typeof s === 'string'), 'all entries are strings');
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 8. getSharedTypes ─────────────────────────────────────────────────
{
  console.log('\n── 8. getSharedTypes ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);

    const shared = reg.getSharedTypes();
    // AuthToken appears in both specs
    const authToken = shared.find(t => t.name === 'AuthToken');
    expect(authToken !== undefined, 'AuthToken identified as shared type (in both components)');
    if (authToken) {
      expect(authToken.usedBy.length >= 2, `AuthToken.usedBy has ≥2 entries (got ${authToken.usedBy.length})`, authToken.usedBy);
      expect(authToken.usedBy.includes('AuthManager'), 'AuthToken.usedBy includes AuthManager');
      expect(authToken.usedBy.includes('ApiGateway'), 'AuthToken.usedBy includes ApiGateway');
    }
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 9. getCrossComponentLinks ─────────────────────────────────────────
{
  console.log('\n── 9. getCrossComponentLinks ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);

    const links = reg.getCrossComponentLinks();
    // ApiGateway imports validateToken from AuthManager
    const gwToAuth = links.find(l => l.source === 'ApiGateway' && l.target === 'AuthManager');
    expect(gwToAuth !== undefined, 'ApiGateway → AuthManager link exists', links);

    // Links should only include known registry components (not RouteRegistry since not ingested)
    const unknownTargets = links.filter(l => !['AuthManager', 'ApiGateway'].includes(l.target));
    expect(unknownTargets.length === 0, 'No links to unknown components', unknownTargets);
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 10. getRegistrySummary — structure and content ────────────────────
{
  console.log('\n── 10. getRegistrySummary — structure ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);

    const summary = reg.getRegistrySummary();
    expect(summary.componentCount === 2, `componentCount = 2 (got ${summary.componentCount})`);
    expect(Array.isArray(summary.components), 'components is array');
    expect(summary.components.length === 2, `2 components in summary`);
    expect(Array.isArray(summary.sharedTypes), 'sharedTypes is array');
    expect(Array.isArray(summary.crossComponentLinks), 'crossComponentLinks is array');

    const authMgr = summary.components.find(c => c.name === 'AuthManager');
    expect(authMgr !== undefined, 'AuthManager appears in summary');
    if (authMgr) {
      expect(authMgr.subsystem === 'Auth', 'AuthManager subsystem correct');
      expect(Array.isArray(authMgr.publicFunctions), 'publicFunctions is array');
      expect(authMgr.publicFunctions.length >= 3, `AuthManager has ≥3 public functions (got ${authMgr.publicFunctions.length})`, authMgr.publicFunctions);
      expect(Array.isArray(authMgr.exports), 'exports is array');
    }
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 11. getRegistrySummary — size budget (< 2K chars for 2 components) ─
{
  console.log('\n── 11. getRegistrySummary — size budget ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    reg.ingestComponent('ApiGateway', 'Gateway', SECOND_SPEC);

    const summary = reg.getRegistrySummary();
    const json = JSON.stringify(summary);
    const chars = json.length;
    // For 2 components with rich specs: target <2K; hard ceiling at 3K
    expect(chars < 3000, `Registry summary is compact for 2 components (${chars} chars < 3000)`, { chars });
    console.log(`     info: summary is ${chars} chars for 2 components`);
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 12. Module-level API (initRegistry / getRegistry / ingestComponent) ─
{
  console.log('\n── 12. Module-level convenience API ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = initRegistry(dbPath);
    expect(reg !== null && typeof reg.componentCount === 'function', 'initRegistry returns registry instance');

    // getRegistry after init
    const reg2 = getRegistry();
    expect(reg2 === reg, 'getRegistry returns same instance');

    // Module-level ingestComponent
    ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);
    expect(reg.componentCount() === 1, 'module-level ingestComponent populates registry');

    // Module-level getAllFunctionSignatures
    const sigs = getAllFunctionSignatures();
    expect(sigs.length >= 3, `module getAllFunctionSignatures returns ≥3 sigs (got ${sigs.length})`);

    // Module-level getSharedTypes (1 component, so empty)
    const shared = getSharedTypes();
    expect(Array.isArray(shared), 'module getSharedTypes returns array');

    // Module-level getCrossComponentLinks (1 component → no cross-component links)
    const links = getCrossComponentLinks();
    expect(Array.isArray(links), 'module getCrossComponentLinks returns array');
    expect(links.length === 0, '1 component has no cross-component links');

    // Module-level getRegistrySummary
    const summary = getRegistrySummary();
    expect(summary.componentCount === 1, 'module getRegistrySummary reflects ingest');
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 13. parse_warnings surfaced via listComponents ────────────────────
{
  console.log('\n── 13. parse_warnings surfaced ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('WeirdThing', 'Unknown', MALFORMED_SPEC);

    const list = reg.listComponents();
    expect(list.length === 1, 'malformed component was still ingested');
    const comp = list[0];
    expect(Array.isArray(comp.parseWarnings), 'parseWarnings is array');
    expect(comp.parseWarnings.length > 0, `malformed component has parse warnings (got ${comp.parseWarnings.length})`);
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 14. Empty registry operations don't throw ─────────────────────────
{
  console.log('\n── 14. Empty registry operations ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    expect(reg.getAllFunctionSignatures().length === 0, 'getAllFunctionSignatures on empty registry = []');
    expect(reg.getSharedTypes().length === 0, 'getSharedTypes on empty registry = []');
    expect(reg.getCrossComponentLinks().length === 0, 'getCrossComponentLinks on empty registry = []');
    const summary = reg.getRegistrySummary();
    expect(summary.componentCount === 0, 'getRegistrySummary on empty registry has componentCount=0');
    expect(summary.components.length === 0, 'getRegistrySummary on empty registry has no components');
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ── 15. getRegistrySummary — isolation contract (no internal metadata) ─
{
  console.log('\n── 15. Isolation contract — no internal metadata in summary ──');
  const { tmp, dbPath } = makeTempDb();
  try {
    const reg = new IntegrationRegistry(dbPath);
    reg.ingestComponent('AuthManager', 'Auth', CANONICAL_SPEC);

    const summary = reg.getRegistrySummary();
    const json = JSON.stringify(summary);

    // Internal metadata that must NOT appear in the summary
    expect(!json.includes('ingested_at'), 'summary excludes ingested_at');
    expect(!json.includes('parse_warnings'), 'summary excludes parse_warnings');
    expect(!json.includes('"id"'), 'summary excludes row ids');
    expect(!json.includes('spec_path'), 'summary excludes spec_path');
    reg.close();
  } finally {
    cleanup(tmp);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
if (failures === 0) {
  console.log(`✅ Integration Registry: ${checks}/${checks} checks passed`);
} else {
  console.error(`❌ Integration Registry: ${checks - failures}/${checks} passed, ${failures} FAILED`);
  process.exit(1);
}
