/**
 * Go anti-hallucination — import validation.
 *
 * Strategy (per ROADMAP §8.4):
 *   1. Extract every import path via regex. Go import syntax is rigid
 *      enough that regex is both sufficient and more portable than
 *      tree-sitter-go (which would require a native build step).
 *   2. Classify each path:
 *        - stdlib (top-level root in the embedded allowlist below)
 *        - third-party (contains a dot in the first path segment →
 *          module path like github.com/foo/bar)
 *        - suspicious (matches known hallucination patterns)
 *        - internal (project-local path without dots)
 *   3. Flag anything that fails those checks.
 *
 * Design notes:
 *   - We do NOT shell out to `go list` or `go mod download`. This detector
 *     runs in-process with zero network. That means we cannot verify that
 *     e.g. `github.com/real/module` actually exists on pkg.go.dev — only
 *     that it has a valid module-path SHAPE. Pairing with `go vet` (in the
 *     quality adapter layer) catches the semantic errors we miss here.
 *   - Dot-imports (`. "path"`) and blank imports (`_ "path"`) are treated
 *     the same as regular imports for validation purposes.
 *   - Aliased imports (`alias "path"`) — we validate the path, not the
 *     alias identifier.
 *
 * Thresholds match the TS/JS detector: hallucinationRate < 10% → passed.
 */

import type { HallucinationReport } from '../../verification/anti-hallucination.js';
import { stripGoComments } from './lexer.js';

// ---------------------------------------------------------------------------
//  Embedded Go stdlib allowlist (top-level roots only).
//  Source: `go list std` output for Go 1.25.
//  A child path like `encoding/json` matches because it starts with `encoding/`.
// ---------------------------------------------------------------------------

const GO_STDLIB_ROOTS = new Set([
  'archive',
  'bufio',
  'builtin',
  'bytes',
  'cmp',
  'compress',
  'container',
  'context',
  'crypto',
  'database',
  'debug',
  'embed',
  'encoding',
  'errors',
  'expvar',
  'flag',
  'fmt',
  'go',
  'hash',
  'html',
  'image',
  'index',
  'io',
  'iter',
  'log',
  'maps',
  'math',
  'mime',
  'net',
  'os',
  'path',
  'plugin',
  'reflect',
  'regexp',
  'runtime',
  'slices',
  'sort',
  'strconv',
  'strings',
  'structs',
  'sync',
  'syscall',
  'testing',
  'text',
  'time',
  'unicode',
  'unsafe',
]);

// ---------------------------------------------------------------------------
//  Suspicious-pattern detection
// ---------------------------------------------------------------------------

const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^fake-?/, reason: 'starts with "fake"' },
  { pattern: /^generated-?/, reason: 'starts with "generated"' },
  { pattern: /^placeholder-?/, reason: 'starts with "placeholder"' },
  // RFC 2606 reserved placeholder TLDs.
  { pattern: /^example\.(com|org|net)\//, reason: 'RFC 2606 placeholder domain' },
  // "your-" is a common README template leakage (your-org/your-module).
  { pattern: /^(your-org|your-module|your-username)\//, reason: 'README template leakage' },
  // Nonsense like "somepackage" or "abc123/xyz" without a dot.
  // Handled by the dotless-check below, not here.
];

// ---------------------------------------------------------------------------
//  Import extraction
// ---------------------------------------------------------------------------

interface ExtractedImport {
  path: string;
  line: number;
}

/**
 * Extract import paths from Go source. Handles both single-line and
 * parenthesized import blocks.
 */
function extractImports(code: string): ExtractedImport[] {
  const stripped = stripGoComments(code);
  const imports: ExtractedImport[] = [];

  // Parenthesized block: import ( ... )
  const blockRe = /\bimport\s*\(([\s\S]*?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(stripped)) !== null) {
    const blockStart = m.index;
    const blockBody = m[1];
    // Line number of the opening paren.
    const baseLine = stripped.slice(0, blockStart).split('\n').length;
    // Match all string literals inside the block.
    const pathRe = /"([^"\n]+)"|`([^`\n]+)`/g;
    let pm: RegExpExecArray | null;
    while ((pm = pathRe.exec(blockBody)) !== null) {
      const path = pm[1] ?? pm[2];
      const relLine = blockBody.slice(0, pm.index).split('\n').length - 1;
      imports.push({ path, line: baseLine + relLine });
    }
  }

  // Single-line import: import "path"  or  import alias "path"
  const singleRe = /\bimport\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)?"([^"\n]+)"/g;
  let s: RegExpExecArray | null;
  while ((s = singleRe.exec(stripped)) !== null) {
    const path = s[1];
    const line = stripped.slice(0, s.index).split('\n').length;
    imports.push({ path, line });
  }

  return imports;
}

// ---------------------------------------------------------------------------
//  Classification
// ---------------------------------------------------------------------------

interface Classification {
  kind: 'stdlib' | 'third_party' | 'internal' | 'suspicious';
  reason?: string;
}

function classify(path: string): Classification {
  if (!path) return { kind: 'suspicious', reason: 'empty path' };

  // Suspicious patterns — check before anything else.
  for (const { pattern, reason } of SUSPICIOUS_PATTERNS) {
    if (pattern.test(path)) {
      return { kind: 'suspicious', reason };
    }
  }

  // Stdlib: first path segment is a known stdlib root AND no dot in any segment.
  const first = path.split('/')[0];
  if (GO_STDLIB_ROOTS.has(first) && !path.includes('.')) {
    return { kind: 'stdlib' };
  }

  // Third-party module path: first segment contains a dot (e.g. github.com, gitlab.com).
  if (first.includes('.')) {
    // Minimum two segments to be a valid module path (host/name).
    if (path.split('/').length < 2) {
      return { kind: 'suspicious', reason: 'module host with no path' };
    }
    return { kind: 'third_party' };
  }

  // Dotless, not in stdlib → internal import (relative to go.mod's module).
  // We can't verify this exists without go.mod, but it's a valid shape.
  // Flag truly bogus cases (single bare word like "foopackage" with no slash).
  if (!path.includes('/')) {
    return {
      kind: 'suspicious',
      reason: 'dotless single-segment path — not a stdlib root, not a module',
    };
  }

  return { kind: 'internal' };
}

// ---------------------------------------------------------------------------
//  Public detector
// ---------------------------------------------------------------------------

export async function detectGoHallucinations(
  code: string,
): Promise<HallucinationReport> {
  const imports = extractImports(code);
  const invalidImports: string[] = [];

  for (const imp of imports) {
    const c = classify(imp.path);
    if (c.kind === 'suspicious') {
      invalidImports.push(`${imp.path} (${c.reason})`);
    }
  }

  // Denominator = max(totalImports, 10) to avoid penalizing tiny files
  // with 1 bad import as "100% hallucinated". Matches the TS detector.
  const totalImports = imports.length;
  const hallucinationRate =
    invalidImports.length > 0
      ? (invalidImports.length / Math.max(totalImports, 10)) * 100
      : 0;

  return {
    invalidImports,
    invalidCalls: [],
    hallucinationRate,
    passed: hallucinationRate < 10,
  };
}

// Exported for unit tests.
export const __internal = { extractImports, classify };
