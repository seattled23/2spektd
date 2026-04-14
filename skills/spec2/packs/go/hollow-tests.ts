/**
 * Go anti-hollow-test detector.
 *
 * Scans Go test source (typically a *_test.go file) for the hollow-test
 * failure patterns defined in ROADMAP §8.4 + anti-hollow.ts's shared
 * severity model.
 *
 * Detection rules (matches the TS/JS detector's rule set):
 *   - `empty_body`            (error)   — body is whitespace/comments only.
 *   - `zero_assertions`       (error)   — body has calls but no assertion calls.
 *   - `tautological_assertion`(error)   — all assertions are guarded by `if true`/`if 1 == 1`
 *                                         or the body contains only `t.Fail()`-inside-`if false`.
 *   - `mock_only`             (warning) — assertions exist but every non-assertion
 *                                         call is a mock-library call (gomock, testify-mock).
 *   - `silent_catch`          (warning) — `defer func() { recover() }()` without a subsequent
 *                                         assertion checking the recovered value.
 *   - `low_density`           (warning) — file-aggregate totalAssertions / totalTests < 1.0.
 *
 * Supported patterns:
 *   - Standard top-level `func TestXxx(t *testing.T) { ... }`.
 *   - Table-driven tests — assertions inside a range loop are counted.
 *   - Subtests via `t.Run("name", func(t *testing.T) { ... })` — the inner body
 *     is scanned as part of its parent Test function (same assertion pool).
 *
 * NOT supported (explicit non-goals for v1):
 *   - TestMain.
 *   - Benchmark / Example / Fuzz functions. These are not test-assertions in
 *     the traditional sense and have different hollow patterns.
 *   - Go-build-tag conditional compilation — we scan the file as written.
 */

import type { HollowReport, HollowIssue } from '../../verification/anti-hollow.js';
import { stripGoComments, findMatchingBrace, lineOf } from './lexer.js';

const MIN_ASSERTIONS_PER_TEST = 1.0;

// testing.T methods that count as real assertions (t.Log* explicitly excluded).
const T_ASSERTION_METHODS = new Set([
  'Error',
  'Errorf',
  'Fatal',
  'Fatalf',
  'Fail',
  'FailNow',
]);

// Third-party assertion libraries. Any `<root>.Something(...)` call counts.
const ASSERTION_LIB_ROOTS = new Set([
  'assert',
  'require',
  'is',
  'should',
  'expect',
]);

// Mock-call indicators — presence without assertions → mock_only warning.
const MOCK_PATTERNS: RegExp[] = [
  /\bgomock\./,
  /\bmockery\./,
  /\bmock\.(On|EXPECT|Anything|AnythingOfType|Run|Return)\b/,
  /\.EXPECT\s*\(\s*\)/,
];

// Tautological guard patterns — entire assertion sits inside one of these.
const TAUTOLOGICAL_GUARDS: RegExp[] = [
  /\bif\s+true\s*\{/,
  /\bif\s+false\s*\{/,
  /\bif\s+(\d+)\s*==\s*\1\s*\{/,   // if 1 == 1
  /\bif\s+(\d+)\s*!=\s*\1\s*\{/,   // if 1 != 1
];

interface GoTestFn {
  name: string;
  receiverName: string;  // the identifier bound to *testing.T, usually 't'
  body: string;
  startLine: number;
}

// ---------------------------------------------------------------------------
//  Extraction
// ---------------------------------------------------------------------------

/**
 * Find every `func TestXxx(<recv> *testing.T) { ... }` in the file,
 * returning the function body (contents between `{` and matching `}`)
 * and the receiver identifier.
 */
function extractTestFns(code: string): GoTestFn[] {
  const out: GoTestFn[] = [];
  // Match signature up to the opening brace. We work on raw source (not
  // stripped) so findMatchingBrace can correctly skip strings/comments
  // inside the body.
  const sigRe =
    /func\s+(Test[A-Z]\w*)\s*\(\s*(\w+|_)\s*\*\s*testing\.T\s*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = sigRe.exec(code)) !== null) {
    const name = m[1];
    const receiverName = m[2];
    const openIdx = m.index + m[0].length - 1;  // position of the `{`
    const closeIdx = findMatchingBrace(code, openIdx);
    if (closeIdx < 0) continue;
    const body = code.slice(openIdx + 1, closeIdx);
    out.push({
      name,
      receiverName,
      body,
      startLine: lineOf(code, m.index),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
//  Body analysis
// ---------------------------------------------------------------------------

interface BodyAnalysis {
  assertionCount: number;
  mockCallCount: number;
  nonMockCallCount: number;
  tautologicalCount: number;
  isEmpty: boolean;
  hasSilentRecover: boolean;
}

/**
 * Count assertion-like and mock-like calls in a body. The body passed in
 * is already the contents between `{` and `}` (raw source, not stripped).
 */
function analyzeBody(body: string, receiver: string): BodyAnalysis {
  const stripped = stripGoComments(body).trim();

  if (stripped === '') {
    return {
      assertionCount: 0,
      mockCallCount: 0,
      nonMockCallCount: 0,
      tautologicalCount: 0,
      isEmpty: true,
      hasSilentRecover: false,
    };
  }

  // Empty if only trivial statements: blank lines, variable declarations
  // without initialization followed by nothing. Heuristic: if there are
  // zero call-expressions `(`, treat as empty.
  const hasAnyCall = /\w\s*\(/.test(stripped);
  if (!hasAnyCall) {
    return {
      assertionCount: 0,
      mockCallCount: 0,
      nonMockCallCount: 0,
      tautologicalCount: 0,
      isEmpty: true,
      hasSilentRecover: false,
    };
  }

  // Count assertion calls on the receiver (e.g. `t.Error(`, `t.Fatalf(`).
  let assertionCount = 0;
  const tReceiverEscaped = escapeRegex(receiver);
  for (const method of T_ASSERTION_METHODS) {
    const re = new RegExp(`\\b${tReceiverEscaped}\\.${method}\\s*\\(`, 'g');
    assertionCount += (stripped.match(re) ?? []).length;
  }
  // Assertion-library calls — any `<root>.*(` where root is a known lib.
  for (const root of ASSERTION_LIB_ROOTS) {
    const re = new RegExp(`\\b${root}\\.[A-Za-z]\\w*\\s*\\(`, 'g');
    assertionCount += (stripped.match(re) ?? []).length;
  }

  // Count mock calls.
  let mockCallCount = 0;
  for (const p of MOCK_PATTERNS) {
    const re = new RegExp(p.source, 'g');
    mockCallCount += (stripped.match(re) ?? []).length;
  }

  // Non-mock, non-assertion calls — crude proxy for "real work".
  // Count every `identifier(` or `x.identifier(` then subtract assertions + mocks.
  const totalCalls = (stripped.match(/[A-Za-z_]\w*\s*\(/g) ?? []).length;
  const nonMockCallCount = Math.max(
    0,
    totalCalls - assertionCount - mockCallCount,
  );

  // Tautological detection — count assertions that sit inside a tautological guard.
  // Heuristic: for each guard regex, find matches; for each, extract the guarded
  // block via brace-matching and count assertions inside it.
  let tautologicalCount = 0;
  for (const guardRe of TAUTOLOGICAL_GUARDS) {
    const re = new RegExp(guardRe.source, 'g');
    let gm: RegExpExecArray | null;
    while ((gm = re.exec(stripped)) !== null) {
      const braceIdx = stripped.indexOf('{', gm.index);
      if (braceIdx < 0) continue;
      const endIdx = findMatchingBrace(stripped, braceIdx);
      if (endIdx < 0) continue;
      const guardedBody = stripped.slice(braceIdx + 1, endIdx);
      tautologicalCount += countAssertionsIn(guardedBody, receiver);
    }
  }

  // Silent-recover detection: `defer func() { recover() }()` with no t.* call inside.
  let hasSilentRecover = false;
  const deferRe = /defer\s+func\s*\(\s*\)\s*\{/g;
  let dm: RegExpExecArray | null;
  while ((dm = deferRe.exec(stripped)) !== null) {
    const braceIdx = stripped.indexOf('{', dm.index);
    if (braceIdx < 0) continue;
    const endIdx = findMatchingBrace(stripped, braceIdx);
    if (endIdx < 0) continue;
    const deferBody = stripped.slice(braceIdx + 1, endIdx);
    if (
      /\brecover\s*\(\s*\)/.test(deferBody) &&
      countAssertionsIn(deferBody, receiver) === 0 &&
      !/\bpanic\s*\(/.test(deferBody)
    ) {
      hasSilentRecover = true;
    }
  }

  return {
    assertionCount,
    mockCallCount,
    nonMockCallCount,
    tautologicalCount,
    isEmpty: false,
    hasSilentRecover,
  };
}

function countAssertionsIn(body: string, receiver: string): number {
  let n = 0;
  const esc = escapeRegex(receiver);
  for (const method of T_ASSERTION_METHODS) {
    n += (body.match(new RegExp(`\\b${esc}\\.${method}\\s*\\(`, 'g')) ?? []).length;
  }
  for (const root of ASSERTION_LIB_ROOTS) {
    n += (body.match(new RegExp(`\\b${root}\\.[A-Za-z]\\w*\\s*\\(`, 'g')) ?? []).length;
  }
  return n;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
//  Public detector
// ---------------------------------------------------------------------------

export async function detectGoHollowTests(code: string): Promise<HollowReport> {
  const fns = extractTestFns(code);
  const issues: HollowIssue[] = [];
  let totalAssertions = 0;

  for (const fn of fns) {
    const a = analyzeBody(fn.body, fn.receiverName);
    totalAssertions += a.assertionCount;

    if (a.isEmpty) {
      issues.push({
        severity: 'error',
        rule: 'empty_body',
        testName: fn.name,
        location: { line: fn.startLine },
        detail: 'Test body is empty or contains only trivial statements',
      });
      continue;
    }

    if (a.assertionCount === 0) {
      issues.push({
        severity: 'error',
        rule: 'zero_assertions',
        testName: fn.name,
        location: { line: fn.startLine },
        detail:
          'Test has no assertions (t.Error/Errorf/Fatal/Fatalf/Fail/FailNow or assert.*/require.*) — it cannot fail regardless of code behavior',
      });
    }

    if (
      a.tautologicalCount > 0 &&
      a.tautologicalCount === a.assertionCount
    ) {
      issues.push({
        severity: 'error',
        rule: 'tautological_assertion',
        testName: fn.name,
        location: { line: fn.startLine },
        detail: `All ${a.assertionCount} assertion(s) are guarded by a tautological condition (if true / if 1 == 1 / etc.)`,
      });
    }

    if (
      a.assertionCount > 0 &&
      a.mockCallCount > 0 &&
      a.nonMockCallCount === 0
    ) {
      issues.push({
        severity: 'warning',
        rule: 'mock_only',
        testName: fn.name,
        location: { line: fn.startLine },
        detail:
          'Test body contains only mock configuration calls and assertions — no real code under test is exercised',
      });
    }

    if (a.hasSilentRecover) {
      issues.push({
        severity: 'warning',
        rule: 'silent_catch',
        testName: fn.name,
        location: { line: fn.startLine },
        detail:
          'Deferred `recover()` with no assertion on the recovered value — panics silently swallowed',
      });
    }
  }

  const totalTests = fns.length;
  const assertionDensity =
    totalTests > 0 ? totalAssertions / totalTests : 0;

  if (totalTests > 0 && assertionDensity < MIN_ASSERTIONS_PER_TEST) {
    // Only emit the density warning if we didn't already flag every test as zero_assertions.
    const zeroAssertionCount = issues.filter(i => i.rule === 'zero_assertions').length;
    if (zeroAssertionCount < totalTests) {
      issues.push({
        severity: 'warning',
        rule: 'low_density',
        testName: '<file>',
        detail: `Assertion density ${assertionDensity.toFixed(2)} below MIN ${MIN_ASSERTIONS_PER_TEST.toFixed(
          2,
        )} (${totalAssertions} assertions across ${totalTests} tests)`,
      });
    }
  }

  const passed = !issues.some(i => i.severity === 'error');

  return {
    language: 'go',
    supported: true,
    totalTests,
    totalAssertions,
    assertionDensity,
    issues,
    passed,
  };
}

// Exported for unit tests.
export const __internal = { extractTestFns, analyzeBody };
