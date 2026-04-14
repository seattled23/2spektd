/**
 * Anti-Hollow Test Detection
 *
 * Detects tests that pass without verifying actual behavior — the failure mode
 * where an LLM-generated test suite reports "all tests pass" but those tests
 * don't actually exercise the code under test.
 *
 * Hollow patterns caught (per language):
 *   - Zero assertions in a test body
 *   - Tautological assertions (assert True, expect(1).toBe(1))
 *   - Empty / pass-only test bodies
 *   - Mock-only success: every call in the body is a mock configuration,
 *     no real code exercised
 *   - Silent error swallowing (empty catch / except: pass)
 *   - Low assertion density across the file (< MIN_ASSERTIONS_PER_TEST)
 *
 * Supported languages:
 *   - TypeScript / JavaScript — AST-based, high precision (via @babel/parser).
 *     Built-in dispatch (not yet migrated to a LanguagePack).
 *   - Python                 — regex heuristics (documented limitation;
 *                              no Python AST available in Node). Covers the
 *                              common patterns but may miss deeply indented
 *                              or unusually formatted code. Built-in dispatch.
 *   - Go                     — regex + brace-aware scanning via the Go
 *                              LanguagePack (§8.4). See packs/go/hollow-tests.ts.
 *
 * Unsupported:
 *   - Rust — returns a report with { supported: false, passed: true } so
 *     callers can decide whether missing-detector is acceptable. Pack pending
 *     per ROADMAP §8.2 priority #5.
 *
 * Design note:
 *   A false-positive (flag a healthy test as hollow) is more costly than a
 *   false-negative (miss a hollow test) because it causes regen churn on
 *   correct code. Thresholds err toward leniency; raise them only with
 *   evidence.
 */

import * as parser from '@babel/parser';
import traverseModule from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type * as t from '@babel/types';
import { getPack } from '../packs/index.js';

// @babel/traverse is CJS; the default export is the traverse function itself
// but the shape under ESM interop differs. Unwrap defensively.
const traverse: typeof traverseModule =
  (traverseModule as unknown as { default: typeof traverseModule }).default ??
  traverseModule;

export interface HollowIssue {
  severity: 'error' | 'warning';
  rule:
    | 'zero_assertions'
    | 'tautological_assertion'
    | 'empty_body'
    | 'mock_only'
    | 'silent_catch'
    | 'low_density';
  testName: string;
  location?: { line?: number };
  detail: string;
}

export interface HollowReport {
  language: string;
  supported: boolean;
  totalTests: number;
  totalAssertions: number;
  assertionDensity: number; // assertions / tests, 0 if no tests
  issues: HollowIssue[];
  passed: boolean; // false if any error-severity issue
}

// Minimum assertions per test — used for density check.
// 1.0 means "every test should have at least one assertion on average".
// We don't enforce per-test here (that's the zero_assertions rule); this is
// a softer aggregate signal. Raise only with empirical evidence.
const MIN_ASSERTIONS_PER_TEST = 1.0;

// ═══════════════════════════════════════════════════════════════════════
//  Public entry point
// ═══════════════════════════════════════════════════════════════════════

export async function detectHollowTests(
  code: string,
  language: string,
): Promise<HollowReport> {
  // Pack-level dispatch — preferred path. See ROADMAP §8.
  const pack = getPack(language);
  if (pack?.hollowTestDetector) {
    return await pack.hollowTestDetector(code);
  }

  // Legacy built-in dispatch (TypeScript/JavaScript/Python pre-pack).
  switch (language) {
    case 'typescript':
    case 'javascript':
      return detectJsHollowTests(code, language);
    case 'python':
      return detectPythonHollowTests(code);
    default:
      return {
        language,
        supported: false,
        totalTests: 0,
        totalAssertions: 0,
        assertionDensity: 0,
        issues: [],
        passed: true,
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  JavaScript / TypeScript — AST-based
// ═══════════════════════════════════════════════════════════════════════

const JS_TEST_FN_NAMES = new Set(['it', 'test', 'specify']);
const JS_ASSERTION_ROOTS = new Set([
  'expect',      // jest / vitest / chai
  'assert',      // node:assert, chai.assert
  'chai',        // chai.expect / chai.should
  'should',      // chai should
  't',           // tape / ava (partial; t.is, t.deepEqual)
]);
const JS_MOCK_METHODS = new Set([
  'mock',
  'mockReturnValue',
  'mockResolvedValue',
  'mockRejectedValue',
  'mockImplementation',
  'mockReturnValueOnce',
  'mockResolvedValueOnce',
  'mockRejectedValueOnce',
  'mockImplementationOnce',
  'spyOn',
  'fn',
]);

function detectJsHollowTests(code: string, language: string): HollowReport {
  const issues: HollowIssue[] = [];
  let totalTests = 0;
  let totalAssertions = 0;

  let ast: t.File;
  try {
    ast = parser.parse(code, {
      sourceType: 'module',
      plugins: language === 'typescript' ? ['typescript', 'jsx'] : ['jsx'],
      errorRecovery: true,
    });
  } catch (err) {
    // Parse failure: return lenient report. Caller can decide based on
    // supported + passed flags.
    return {
      language,
      supported: true,
      totalTests: 0,
      totalAssertions: 0,
      assertionDensity: 0,
      issues: [
        {
          severity: 'warning',
          rule: 'empty_body',
          testName: '<parse-error>',
          detail: `Could not parse ${language}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
      ],
      passed: true,
    };
  }

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      if (!isJsTestCall(path.node)) return;
      totalTests++;

      const testName = extractJsTestName(path.node);
      const bodyFn = path.node.arguments.find(
        arg =>
          arg.type === 'ArrowFunctionExpression' ||
          arg.type === 'FunctionExpression',
      ) as t.ArrowFunctionExpression | t.FunctionExpression | undefined;

      if (!bodyFn) {
        issues.push({
          severity: 'error',
          rule: 'empty_body',
          testName,
          location: { line: path.node.loc?.start.line },
          detail: 'Test declared with no function body',
        });
        return;
      }

      const analysis = analyzeJsTestBody(bodyFn.body);
      totalAssertions += analysis.assertionCount;

      if (analysis.isEmpty) {
        issues.push({
          severity: 'error',
          rule: 'empty_body',
          testName,
          location: { line: path.node.loc?.start.line },
          detail: 'Test body is empty or contains only trivial statements',
        });
        return;
      }

      if (analysis.assertionCount === 0) {
        issues.push({
          severity: 'error',
          rule: 'zero_assertions',
          testName,
          location: { line: path.node.loc?.start.line },
          detail:
            'Test has no assertions — it cannot fail regardless of code behavior',
        });
      }

      if (analysis.tautologicalCount > 0 && analysis.tautologicalCount === analysis.assertionCount) {
        issues.push({
          severity: 'error',
          rule: 'tautological_assertion',
          testName,
          location: { line: path.node.loc?.start.line },
          detail: `All ${analysis.assertionCount} assertion(s) compare constants to themselves (e.g., expect(1).toBe(1))`,
        });
      }

      if (
        analysis.assertionCount > 0 &&
        analysis.nonMockCallCount === 0 &&
        analysis.mockCallCount > 0
      ) {
        issues.push({
          severity: 'warning',
          rule: 'mock_only',
          testName,
          location: { line: path.node.loc?.start.line },
          detail: `Test exercises only mocks (${analysis.mockCallCount} mock calls, 0 real calls) — does not verify real behavior`,
        });
      }

      if (analysis.silentCatchCount > 0) {
        issues.push({
          severity: 'warning',
          rule: 'silent_catch',
          testName,
          location: { line: path.node.loc?.start.line },
          detail: `Test swallows errors in catch/finally (${analysis.silentCatchCount} silent catch block(s))`,
        });
      }
    },
  });

  const density = totalTests > 0 ? totalAssertions / totalTests : 0;

  if (totalTests > 0 && density < MIN_ASSERTIONS_PER_TEST) {
    issues.push({
      severity: 'warning',
      rule: 'low_density',
      testName: '<file>',
      detail: `Assertion density ${density.toFixed(2)} below threshold ${MIN_ASSERTIONS_PER_TEST} (${totalAssertions} assertions across ${totalTests} tests)`,
    });
  }

  return {
    language,
    supported: true,
    totalTests,
    totalAssertions,
    assertionDensity: density,
    issues,
    passed: !issues.some(i => i.severity === 'error'),
  };
}

function isJsTestCall(node: t.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === 'Identifier' && JS_TEST_FN_NAMES.has(callee.name)) {
    return true;
  }
  // it.only, test.skip, it.each, etc. — still a test
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    JS_TEST_FN_NAMES.has(callee.object.name)
  ) {
    return true;
  }
  return false;
}

function extractJsTestName(node: t.CallExpression): string {
  const first = node.arguments[0];
  if (first?.type === 'StringLiteral') return first.value;
  if (first?.type === 'TemplateLiteral' && first.quasis[0]) {
    return first.quasis[0].value.cooked ?? '<template>';
  }
  return '<unnamed>';
}

interface JsBodyAnalysis {
  isEmpty: boolean;
  assertionCount: number;
  tautologicalCount: number;
  mockCallCount: number;
  nonMockCallCount: number;
  silentCatchCount: number;
}

function analyzeJsTestBody(body: t.BlockStatement | t.Expression): JsBodyAnalysis {
  const result: JsBodyAnalysis = {
    isEmpty: true,
    assertionCount: 0,
    tautologicalCount: 0,
    mockCallCount: 0,
    nonMockCallCount: 0,
    silentCatchCount: 0,
  };

  if (body.type !== 'BlockStatement') {
    // Arrow returning expression — treat as potential assertion if it's a call
    result.isEmpty = false;
    if (body.type === 'CallExpression' && isJsAssertion(body as t.CallExpression)) {
      result.assertionCount = 1;
      if (isJsTautological(body as t.CallExpression)) result.tautologicalCount = 1;
    }
    return result;
  }

  // Count non-trivial statements
  const meaningful = body.body.filter(
    stmt =>
      stmt.type !== 'EmptyStatement' &&
      !(stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'StringLiteral'), // drop docstrings
  );
  result.isEmpty = meaningful.length === 0;

  // Walk the body counting.
  //
  // Key subtlety: expect(x).toBe(y) is a SINGLE assertion but contains two
  // CallExpression nodes (the outer `.toBe(y)` and the inner `expect(x)`).
  // We only count the TOP of each call-chain — i.e., a CallExpression is
  // the "top" when its parent is NOT a MemberExpression whose `.object`
  // is this node. That member-object case means this call is being
  // chained onto (e.g., we're inside `expect(x)` which is the base of
  // `expect(x).toBe(y)`). Counting only tops also handles longer chains:
  // `expect(x).to.equal(y).and.have.length(3)` → one assertion.
  traverse(
    {
      type: 'File',
      program: {
        type: 'Program',
        body: body.body,
        directives: [],
        sourceType: 'module',
      },
    } as unknown as t.File,
    {
      noScope: true,
      CallExpression(path: NodePath<t.CallExpression>) {
        // Skip non-top-of-chain calls
        const parent = path.parent;
        if (
          parent.type === 'MemberExpression' &&
          parent.object === path.node
        ) {
          return;
        }

        if (isJsAssertion(path.node)) {
          result.assertionCount++;
          if (isJsTautological(path.node)) result.tautologicalCount++;
        } else if (isJsMockCall(path.node)) {
          result.mockCallCount++;
        } else {
          // Any other call = real code being exercised
          result.nonMockCallCount++;
        }
      },
      CatchClause(path: NodePath<t.CatchClause>) {
        if (path.node.body.body.length === 0) {
          result.silentCatchCount++;
        }
      },
    },
  );

  return result;
}

function isJsAssertion(node: t.CallExpression): boolean {
  // expect(...).toBe(...)  — callee is MemberExpression, root is expect()
  // assert(...)
  // assert.equal(...)
  // chai.expect(...).to.equal(...)
  // t.is(...), t.deepEqual(...)

  // Unwrap to find the root identifier
  let cur: t.Node = node.callee;
  while (cur.type === 'MemberExpression') {
    cur = cur.object;
  }
  if (cur.type === 'CallExpression') {
    // expect(...).toBe(...)  → root is expect(x)
    return isJsAssertion(cur);
  }
  if (cur.type === 'Identifier') {
    return JS_ASSERTION_ROOTS.has(cur.name);
  }
  return false;
}

function isJsTautological(node: t.CallExpression): boolean {
  // Look at the outermost assertion: expect(X).toBe(Y) → X and Y both literals
  // We consider it tautological if BOTH sides are static literals
  // and either (a) they're deeply equal, or
  //            (b) the assertion is `.toBeTruthy()` on a truthy literal,
  //                `.toBe(true)` on `true`, etc.

  // Find the `expect(X)` call and the matcher args.
  // Pattern: MemberExpression { object: CallExpression(expect, [X]), property: Identifier(matcher) }
  if (node.callee.type !== 'MemberExpression') return false;
  const memberObject = node.callee.object;
  if (memberObject.type !== 'CallExpression') return false;

  const expectArgs = memberObject.arguments;
  const matcherArgs = node.arguments;

  if (expectArgs.length === 0) return false;

  const subject = expectArgs[0];
  if (!isJsStaticLiteral(subject)) return false;

  // Matcher with arg: .toBe(x), .toEqual(x), .toBeGreaterThan(x)
  if (matcherArgs.length === 1) {
    const other = matcherArgs[0];
    if (!isJsStaticLiteral(other)) return false;
    return jsStaticEquals(subject, other);
  }

  // No-arg matcher: .toBeTruthy(), .toBeDefined(), .toBeNull(), .toBeUndefined()
  if (matcherArgs.length === 0 && node.callee.property.type === 'Identifier') {
    const matcher = node.callee.property.name;
    return isJsTrivialNoArgMatcher(subject, matcher);
  }

  return false;
}

function isJsStaticLiteral(node: t.Node | t.Expression | t.SpreadElement | t.ArgumentPlaceholder): boolean {
  if (!('type' in node)) return false;
  return (
    node.type === 'StringLiteral' ||
    node.type === 'NumericLiteral' ||
    node.type === 'BooleanLiteral' ||
    node.type === 'NullLiteral' ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

function jsStaticEquals(a: t.Node, b: t.Node): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'StringLiteral' && b.type === 'StringLiteral') return a.value === b.value;
  if (a.type === 'NumericLiteral' && b.type === 'NumericLiteral') return a.value === b.value;
  if (a.type === 'BooleanLiteral' && b.type === 'BooleanLiteral') return a.value === b.value;
  if (a.type === 'NullLiteral' && b.type === 'NullLiteral') return true;
  if (a.type === 'Identifier' && b.type === 'Identifier')
    return a.name === 'undefined' && b.name === 'undefined';
  return false;
}

function isJsTrivialNoArgMatcher(subject: t.Node, matcher: string): boolean {
  switch (matcher) {
    case 'toBeTruthy':
      if (subject.type === 'BooleanLiteral') return subject.value === true;
      if (subject.type === 'NumericLiteral') return subject.value !== 0;
      if (subject.type === 'StringLiteral') return subject.value.length > 0;
      return false;
    case 'toBeFalsy':
      if (subject.type === 'BooleanLiteral') return subject.value === false;
      if (subject.type === 'NumericLiteral') return subject.value === 0;
      if (subject.type === 'StringLiteral') return subject.value.length === 0;
      if (subject.type === 'NullLiteral') return true;
      if (subject.type === 'Identifier' && subject.name === 'undefined') return true;
      return false;
    case 'toBeNull':
      return subject.type === 'NullLiteral';
    case 'toBeUndefined':
      return subject.type === 'Identifier' && subject.name === 'undefined';
    case 'toBeDefined':
      // expect(literal).toBeDefined() is trivial for any non-undefined literal
      return !(subject.type === 'Identifier' && subject.name === 'undefined');
    default:
      return false;
  }
}

function isJsMockCall(node: t.CallExpression): boolean {
  // jest.fn(), jest.mock('...'), x.mockReturnValue(...), vi.spyOn(...)
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (callee.property.type !== 'Identifier') return false;
  return JS_MOCK_METHODS.has(callee.property.name);
}

// ═══════════════════════════════════════════════════════════════════════
//  Python — regex heuristics
//
//  Limitation: no Python AST in Node. This catches the common patterns but
//  relies on consistent 4-space indentation and standard test-function
//  conventions (def test_*, class Test*). Unusually formatted code may slip
//  through. Document in roadmap.
// ═══════════════════════════════════════════════════════════════════════

const PY_TEST_FN_RE = /^(\s*)def\s+(test_[A-Za-z0-9_]+)\s*\(/gm;
const PY_ASSERT_RES = [
  /\bassert\s+/g,
  /\bself\.assert[A-Z]\w*\s*\(/g,
  /\bpytest\.(raises|warns)\s*\(/g,
];
const PY_TAUTOLOGICAL_PATTERNS = [
  /\bassert\s+True\b(?!\s*[,=<>])/,
  /\bassert\s+1\s*==\s*1\b/,
  /\bassert\s+True\s*==\s*True\b/,
  /\bassert\s+not\s+False\b/,
  /\bself\.assertTrue\s*\(\s*True\s*\)/,
  /\bself\.assertEqual\s*\(\s*(\d+|\"[^\"]*\"|'[^']*')\s*,\s*\1\s*\)/,
];

function detectPythonHollowTests(code: string): HollowReport {
  const issues: HollowIssue[] = [];
  const tests = extractPythonTests(code);
  let totalAssertions = 0;

  for (const test of tests) {
    const bodyAssertions = countPythonAssertions(test.body);
    totalAssertions += bodyAssertions;

    const trimmedBody = test.body.trim();

    // Empty / pass-only
    if (
      trimmedBody === '' ||
      trimmedBody === 'pass' ||
      trimmedBody.match(/^(\.{3}|pass|"""[\s\S]*""")$/)
    ) {
      issues.push({
        severity: 'error',
        rule: 'empty_body',
        testName: test.name,
        location: { line: test.line },
        detail: 'Test body is empty or only contains pass/docstring',
      });
      continue;
    }

    // Zero assertions
    if (bodyAssertions === 0) {
      issues.push({
        severity: 'error',
        rule: 'zero_assertions',
        testName: test.name,
        location: { line: test.line },
        detail: 'Test has no assertions — it cannot fail regardless of code behavior',
      });
    }

    // Tautological assertions: if EVERY line matches a tautological pattern
    const assertLines = test.body
      .split('\n')
      .filter(l => PY_ASSERT_RES.some(re => re.test(l)));

    if (
      assertLines.length > 0 &&
      assertLines.every(l =>
        PY_TAUTOLOGICAL_PATTERNS.some(p => p.test(l)),
      )
    ) {
      issues.push({
        severity: 'error',
        rule: 'tautological_assertion',
        testName: test.name,
        location: { line: test.line },
        detail: 'All assertions are tautological (e.g., assert True, assert 1 == 1)',
      });
    }

    // Silent except
    if (/except\s*(\w+\s*)?:\s*(\n\s+pass\b|\n\s+\.{3})/.test(test.body)) {
      issues.push({
        severity: 'warning',
        rule: 'silent_catch',
        testName: test.name,
        location: { line: test.line },
        detail: 'Test uses bare except: pass — silently swallows errors',
      });
    }
  }

  const density = tests.length > 0 ? totalAssertions / tests.length : 0;

  if (tests.length > 0 && density < MIN_ASSERTIONS_PER_TEST) {
    issues.push({
      severity: 'warning',
      rule: 'low_density',
      testName: '<file>',
      detail: `Assertion density ${density.toFixed(2)} below threshold ${MIN_ASSERTIONS_PER_TEST} (${totalAssertions} assertions across ${tests.length} tests)`,
    });
  }

  return {
    language: 'python',
    supported: true,
    totalTests: tests.length,
    totalAssertions,
    assertionDensity: density,
    issues,
    passed: !issues.some(i => i.severity === 'error'),
  };
}

interface PythonTest {
  name: string;
  body: string;
  line: number;
}

function extractPythonTests(code: string): PythonTest[] {
  const lines = code.split('\n');
  const tests: PythonTest[] = [];

  // Reset regex state across calls
  PY_TEST_FN_RE.lastIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)def\s+(test_[A-Za-z0-9_]+)\s*\(/);
    if (!m) continue;

    const indent = m[1].length;
    const name = m[2];
    const bodyLines: string[] = [];

    // Body is subsequent lines at deeper indentation, until dedent or EOF
    for (let j = i + 1; j < lines.length; j++) {
      const bl = lines[j];
      // Blank line — include
      if (bl.trim() === '') {
        bodyLines.push(bl);
        continue;
      }
      // Compute leading whitespace
      const leading = bl.match(/^(\s*)/)![1].length;
      if (leading <= indent) break;
      bodyLines.push(bl);
    }

    tests.push({
      name,
      body: bodyLines.join('\n'),
      line: i + 1,
    });
  }

  return tests;
}

function countPythonAssertions(body: string): number {
  let count = 0;
  for (const re of PY_ASSERT_RES) {
    re.lastIndex = 0;
    const matches = body.match(re);
    if (matches) count += matches.length;
  }
  return count;
}
