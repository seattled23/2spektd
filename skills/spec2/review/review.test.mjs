#!/usr/bin/env node
/**
 * Unit tests for the Visual Review Package.
 *
 * Asserts:
 *   1. Extractors recover canonical fields from well-formed specs
 *   2. Extractors record warnings (not crash) on malformed specs
 *   3. Renderers produce valid Mermaid fences and safe markdown
 *   4. Each review file fits a reasonable page budget (<6 KB)
 *   5. The review module never imports llm.ts — determinism invariant
 *
 * Run: node review.test.mjs
 */

import { readFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  extractSystem,
  extractSubsystem,
  extractComponent,
  extractIntegration,
  splitContractParties,
} from '../dist/review/extract.js';
import {
  renderSystemReview,
  renderSubsystemReview,
  renderComponentReview,
  renderIntegrationReview,
} from '../dist/review/render.js';
import {
  generateSystemReview,
  generateSubsystemReview,
  generateComponentReview,
  generateIntegrationReview,
  generateAllReviews,
} from '../dist/review/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let failures = 0;
let checks = 0;

function firstDiff(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return {
        pos: i,
        a: a.slice(Math.max(0, i - 20), i + 40),
        b: b.slice(Math.max(0, i - 20), i + 40),
      };
    }
  }
  return { pos: len, tailDiff: true };
}

function expect(cond, msg, ctx) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ❌ ${msg}`);
    if (ctx !== undefined) console.error('     ctx:', JSON.stringify(ctx, null, 2).slice(0, 400));
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Fixtures — matches the templates in agents/tier{1,2,3,4}.ts
// ═══════════════════════════════════════════════════════════════════════

const SYSTEM_SPEC = `
# System Specification

## System Overview
A URL shortener service that maps long URLs to short codes with
rate-limiting, analytics, and custom-slug support. Designed for
high read-throughput and durable writes.

## Subsystems
### Subsystem: ShortenerCore
**Purpose:** Create short codes and resolve them back to long URLs.
**Key Responsibilities:**
- Accept a long URL and return a short code
- Resolve a short code back to its long URL
- Enforce custom-slug rules

### Subsystem: RateLimiter
**Purpose:** Enforce per-IP and per-API-key request limits.
**Key Responsibilities:**
- Track request counts in a sliding window
- Reject requests that exceed the quota
- Emit rate-limit headers

### Subsystem: Analytics
**Purpose:** Record clicks and aggregate metrics per short code.
**Key Responsibilities:**
- Write a click event on every resolve
- Aggregate counts per short code per day

## Non-Functional Requirements
- **Performance:** p99 resolve latency < 50ms
- **Security:** all endpoints over TLS; API keys hashed at rest
- **Scalability:** horizontal scale of stateless API nodes
`;

const SUBSYSTEM_SPEC = `
# Subsystem: ShortenerCore

## Overview
Handles creation and resolution of short codes. Persists mapping in a
key-value store; uses a collision-free base62 encoding.

## Components
### Component: CodeGenerator
Generates base62 short codes from a monotonic counter.

### Component: URLStore
Persists short-code → long-URL mappings with TTL support.

### Component: SlugValidator
Validates custom slugs against a reserved-word blocklist.

## Dependencies
- From: [RateLimiter] | What: [checkQuota(apiKey) → Allowance] | Contract: returns Allowance with remaining count
- From: [Analytics] | What: [recordResolve(code, userAgent)] | Contract: fire-and-forget write

## Test Strategy
Unit tests per component with fakes for the KV store; integration test for the full create+resolve flow.
`;

const COMPONENT_SPEC = `
# Component: URLStore

## Overview
Persistent mapping from short codes to long URLs. Supports TTL and
idempotent writes.

## Data Model

### Type: URLRecord
\`\`\`
interface URLRecord {
  code: string;
  longUrl: string;
  createdAt: number;
  expiresAt?: number;
}
\`\`\`
**Purpose:** Canonical stored record for a shortened URL.

### Type: StoreHandle
\`\`\`
interface StoreHandle { ready: boolean; }
\`\`\`
**Purpose:** Opaque handle representing an active store connection.

## Functions

### \`saveUrl(code: string, longUrl: string, ttl?: number) → URLRecord\`
**Purpose:** Persist a new short-code → long-URL mapping.
**@pre:** code is unique; longUrl is a valid http(s) URL
**@post:** Record is retrievable via getUrl(code)
**@error:**
- Duplicate: code already exists
- InvalidUrl: longUrl fails validation

### \`getUrl(code: string) → URLRecord | null\`
**Purpose:** Look up a record by its short code.
**@pre:** code is non-empty
**@post:** Returns record if found and unexpired
**@error:** None

### \`deleteUrl(code: string) → boolean\`
**Purpose:** Delete a stored mapping.
**@pre:** caller has authorization
**@post:** Subsequent getUrl returns null
**@error:** None

## Dependencies

**Imports (what this component needs):**
- From: [KVBackend] | What: [put(key, value, ttl?)] | Contract: idempotent
- From: [KVBackend] | What: [get(key)] | Contract: returns bytes or null

**Exports (what this component provides):**
- saveUrl(code: string, longUrl: string, ttl?: number) → URLRecord
- getUrl(code: string) → URLRecord | null
- deleteUrl(code: string) → boolean
`;

const INTEGRATION_SPEC = `
# Integration Specification

## Shared Types
\`\`\`
interface URLRecord { code: string; longUrl: string; }
interface Allowance { remaining: number; resetAt: number; }
\`\`\`

## Interface Contracts
### Contract: [RateLimiter] ↔ [ShortenerCore]
**Purpose:** Gate write traffic before it hits the store.
**Interface:**
- [RateLimiter provides]: checkQuota(apiKey) → Allowance
- [ShortenerCore consumes]: the Allowance to short-circuit or proceed
**Data Format:** Allowance object per call

### Contract: [ShortenerCore] ↔ [Analytics]
**Purpose:** Record every resolve for later aggregation.
**Interface:**
- [ShortenerCore provides]: recordResolve(code, userAgent)
- [Analytics consumes]: fire-and-forget write
**Data Format:** ClickEvent record

## Data Flows
Client → API → RateLimiter check → ShortenerCore (create or resolve) →
URLStore I/O → Analytics write (async) → response to client.

## Cross-Cutting Standards
- **Authentication:** API key in Authorization header, hashed at rest
- **Logging:** structured JSON logs with traceId on every request
- **Error Handling:** errors propagate as typed exceptions; top-level handler maps to HTTP codes
`;

// ═══════════════════════════════════════════════════════════════════════
//  1. System extractor
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── System extractor ──');
  const x = extractSystem(SYSTEM_SPEC);
  expect(x.title === 'System Specification', 'title extracted', x.title);
  expect(x.overview.includes('URL shortener'), 'overview captured', x.overview);
  expect(x.subsystems.length === 3, '3 subsystems found', x.subsystems.map(s => s.name));
  expect(
    x.subsystems.some(s => s.name === 'RateLimiter'),
    'RateLimiter subsystem recovered',
    x.subsystems,
  );
  const core = x.subsystems.find(s => s.name === 'ShortenerCore');
  expect(
    core && core.responsibilities.length >= 2,
    'ShortenerCore has responsibilities',
    core?.responsibilities,
  );
  expect(
    x.nfr.Performance && x.nfr.Performance.includes('50ms'),
    'NFR Performance captured',
    x.nfr,
  );
  expect(x.warnings.length === 0, 'no warnings on canonical spec', x.warnings);
}

// ═══════════════════════════════════════════════════════════════════════
//  2. Subsystem extractor
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Subsystem extractor ──');
  const x = extractSubsystem(SUBSYSTEM_SPEC);
  expect(x.name === 'ShortenerCore', 'subsystem name extracted', x.name);
  expect(x.components.length === 3, '3 components parsed', x.components.map(c => c.name));
  expect(
    x.components.some(c => c.name === 'CodeGenerator'),
    'CodeGenerator parsed',
    x.components,
  );
  expect(x.dependencies.length === 2, '2 dependencies parsed', x.dependencies);
  const rl = x.dependencies.find(d => d.from === 'RateLimiter');
  expect(rl && rl.what.includes('checkQuota'), 'RateLimiter dep carries contract', rl);
  expect(x.warnings.length === 0, 'no warnings on canonical spec', x.warnings);
}

// ═══════════════════════════════════════════════════════════════════════
//  3. Component extractor
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Component extractor ──');
  const x = extractComponent(COMPONENT_SPEC);
  expect(x.name === 'URLStore', 'component name extracted', x.name);
  expect(x.types.length === 2, '2 types parsed', x.types.map(t => t.name));
  expect(x.functions.length === 3, '3 functions parsed', x.functions.map(f => f.signature));
  const saveUrl = x.functions.find(f => f.signature.startsWith('saveUrl'));
  expect(saveUrl && saveUrl.purpose.includes('Persist'), 'saveUrl purpose captured', saveUrl);
  expect(x.imports.length === 2, '2 imports parsed', x.imports);
  expect(x.exports.length === 3, '3 exports parsed', x.exports);
  expect(x.warnings.length === 0, 'no warnings on canonical spec', x.warnings);
}

// ═══════════════════════════════════════════════════════════════════════
//  4. Integration extractor
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Integration extractor ──');
  const x = extractIntegration(INTEGRATION_SPEC);
  expect(x.sharedTypes.length === 2, '2 shared types parsed', x.sharedTypes);
  expect(
    x.sharedTypes.includes('URLRecord') && x.sharedTypes.includes('Allowance'),
    'both shared types identified',
    x.sharedTypes,
  );
  expect(x.contracts.length === 2, '2 contracts parsed', x.contracts.map(c => c.parties));
  expect(
    x.standards.Authentication && x.standards.Logging && x.standards['Error Handling'],
    '3 standards captured',
    x.standards,
  );
  expect(x.dataFlows.includes('RateLimiter'), 'data flows captured', x.dataFlows);
  expect(x.warnings.length === 0, 'no warnings on canonical spec', x.warnings);
}

// ═══════════════════════════════════════════════════════════════════════
//  5. Contract party splitter
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── splitContractParties ──');
  const a = splitContractParties('[RateLimiter] ↔ [ShortenerCore]');
  expect(a && a[0] === 'RateLimiter' && a[1] === 'ShortenerCore', 'parses bracketed form', a);
  const b = splitContractParties('A ↔ B');
  expect(b && b[0] === 'A' && b[1] === 'B', 'parses bare form', b);
  const c = splitContractParties('Just one thing');
  expect(c === null, 'rejects unparsable form', c);
}

// ═══════════════════════════════════════════════════════════════════════
//  6. Renderer output sanity (Mermaid fences + markdown structure)
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Renderers ──');
  const sys = renderSystemReview(extractSystem(SYSTEM_SPEC), 'system/system.md');
  expect(sys.includes('```mermaid'), 'system review has mermaid fence', sys.slice(0, 200));
  expect(sys.includes('graph TD'), 'system review uses graph TD', sys.slice(0, 300));
  expect(sys.length < 6000, 'system review fits page budget (<6KB)', sys.length);
  expect(sys.includes('## Executive Summary'), 'system review has exec summary heading');

  const sub = renderSubsystemReview(extractSubsystem(SUBSYSTEM_SPEC), 's.md');
  expect(sub.includes('subgraph'), 'subsystem review uses subgraph', sub.slice(0, 400));
  expect(sub.includes('## Dependencies'), 'subsystem review has deps heading');
  expect(sub.length < 6000, 'subsystem review fits page budget', sub.length);

  const cmp = renderComponentReview(extractComponent(COMPONENT_SPEC), 'c.md');
  expect(cmp.includes('classDiagram'), 'component review uses classDiagram', cmp.slice(0, 400));
  expect(cmp.length < 6000, 'component review fits page budget', cmp.length);

  const itg = renderIntegrationReview(extractIntegration(INTEGRATION_SPEC), 'i.md');
  expect(itg.includes('graph LR'), 'integration review uses graph LR', itg.slice(0, 400));
  expect(itg.includes('<-->'), 'integration review has bidirectional edges');
  expect(itg.length < 6000, 'integration review fits page budget', itg.length);
}

// ═══════════════════════════════════════════════════════════════════════
//  7. Malformed specs degrade gracefully — warnings, no crash
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Malformed spec degradation ──');
  const empty = extractSystem('');
  expect(Array.isArray(empty.subsystems), 'empty system spec returns struct', empty);
  expect(empty.warnings.length > 0, 'empty system spec records warnings', empty.warnings);

  const weirdSub = extractSubsystem('# Subsystem: X\n(no sections at all)');
  expect(weirdSub.name === 'X', 'weird subsystem name still parsed', weirdSub.name);
  expect(weirdSub.warnings.length > 0, 'weird subsystem records warnings', weirdSub.warnings);

  const weirdCmp = extractComponent('# Component: Z\n');
  expect(weirdCmp.name === 'Z', 'weird component name still parsed', weirdCmp.name);
  expect(weirdCmp.warnings.length > 0, 'weird component records warnings', weirdCmp.warnings);
}

// ═══════════════════════════════════════════════════════════════════════
//  8. Disk I/O — files land where expected
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Disk layout ──');
  const td = mkdtempSync(join(tmpdir(), 'spec2-review-'));
  try {
    const ctx = {
      outputDir: td,
      systemSpec: SYSTEM_SPEC,
      subsystemSpecs: new Map([['ShortenerCore', SUBSYSTEM_SPEC]]),
      componentSpecs: new Map([['URLStore', COMPONENT_SPEC]]),
      integrationSpec: INTEGRATION_SPEC,
    };
    const results = generateAllReviews(ctx);
    expect(results.length === 4, 'generateAllReviews writes 4 files', results.length);

    expect(existsSync(join(td, 'review', 'system.md')), 'system.md exists');
    expect(
      existsSync(join(td, 'review', 'subsystems', 'ShortenerCore.md')),
      'subsystem file exists under subsystems/',
    );
    expect(
      existsSync(join(td, 'review', 'components', 'URLStore.md')),
      'component file exists under components/',
    );
    expect(existsSync(join(td, 'review', 'integration.md')), 'integration.md exists');

    // Idempotency: re-running overwrites with same content (modulo timestamp).
    // Strip the entire Generated line including its enclosing underscores.
    const stripTs = (s) => s.replace(/_Generated:[^_]*_/g, '_Generated: X_');
    const before = stripTs(readFileSync(join(td, 'review', 'system.md'), 'utf8'));
    // Wait long enough for ISO timestamps to differ by at least one ms.
    await new Promise(r => setTimeout(r, 5));
    generateSystemReview(ctx, SYSTEM_SPEC);
    const after = stripTs(readFileSync(join(td, 'review', 'system.md'), 'utf8'));
    expect(before === after, 'system review is deterministic (modulo timestamp)', {
      beforeLen: before.length,
      afterLen: after.length,
      firstDiff: firstDiff(before, after),
    });

    // Safe filename: component with slashes doesn't escape the dir
    const safeName = '../../evil';
    generateComponentReview(ctx, safeName, COMPONENT_SPEC);
    const compDir = join(td, 'review', 'components');
    const compFiles = readdirSync(compDir);
    expect(
      compFiles.every(f => !f.includes('/') && !f.includes('..')),
      'unsafe component names are sanitized',
      compFiles,
    );
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  9. Determinism invariant — no LLM imports in the review module
// ═══════════════════════════════════════════════════════════════════════

{
  console.log('\n── Isolation invariant: no LLM imports ──');
  // Static string scan of the compiled review/*.js files. If a refactor ever
  // adds an llm.ts import here, this test catches it before deploy.
  const reviewDir = resolve(HERE, '..', 'dist', 'review');
  const jsFiles = readdirSync(reviewDir).filter(f => f.endsWith('.js'));
  expect(jsFiles.length >= 3, 'dist/review has compiled output', jsFiles);
  for (const f of jsFiles) {
    const src = readFileSync(join(reviewDir, f), 'utf8');
    const hasLlm = /from ['"][^'"]*llm[^'"]*['"]/i.test(src)
      || /require\(['"][^'"]*llm[^'"]*['"]\)/i.test(src);
    expect(!hasLlm, `${f} does not import llm module`, {
      file: f,
      snippets: src.match(/from ['"].+['"]/g)?.slice(0, 10),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════════════════

console.log('');
if (failures === 0) {
  console.log(`✅ All ${checks} review-package checks passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failures} / ${checks} review-package checks failed.`);
  process.exit(1);
}
