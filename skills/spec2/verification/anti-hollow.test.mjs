#!/usr/bin/env node
/**
 * Unit tests for anti-hollow test detector.
 *
 * Runs hand-crafted healthy and hollow test-code fixtures through the
 * detector and asserts the expected verdict for each. If this suite passes
 * we have reasonable confidence the detector is not lying to us.
 *
 * Run: node anti-hollow.test.mjs
 */

import { detectHollowTests } from '../dist/verification/anti-hollow.js';

let failures = 0;
let checks = 0;

function expect(cond, msg, ctx) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ❌ ${msg}`);
    if (ctx !== undefined) console.error('     ctx:', JSON.stringify(ctx, null, 2));
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function check(name, lang, code, expectations) {
  console.log(`\n── ${name} (${lang}) ──`);
  const report = await detectHollowTests(code, lang);
  expectations(report);
}

function rules(report) {
  return report.issues.map(i => i.rule);
}

// ═══════════════════════════════════════════════════════════════════════
//  JavaScript / TypeScript
// ═══════════════════════════════════════════════════════════════════════

await check(
  'healthy test: real assertions on computed value',
  'typescript',
  `
  import { add } from './math';
  describe('add', () => {
    it('adds two positive numbers', () => {
      const result = add(2, 3);
      expect(result).toBe(5);
    });
    it('adds negative numbers', () => {
      expect(add(-1, -2)).toBe(-3);
    });
  });
  `,
  r => {
    expect(r.passed, 'healthy test should pass');
    expect(r.totalTests === 2, `expected 2 tests, got ${r.totalTests}`, r);
    expect(r.totalAssertions === 2, `expected 2 assertions, got ${r.totalAssertions}`, r);
    expect(r.issues.length === 0, 'healthy test should have no issues', r.issues);
  }
);

await check(
  'hollow: empty test body',
  'typescript',
  `it('does nothing', () => {});`,
  r => {
    expect(!r.passed, 'empty body should fail');
    expect(rules(r).includes('empty_body'), 'should flag empty_body', r.issues);
  }
);

await check(
  'hollow: zero assertions',
  'typescript',
  `
  it('runs code but never asserts', () => {
    const x = 1 + 1;
    console.log(x);
  });
  `,
  r => {
    expect(!r.passed, 'zero-assertion test should fail');
    expect(rules(r).includes('zero_assertions'), 'should flag zero_assertions', r.issues);
  }
);

await check(
  'hollow: tautological expect(1).toBe(1)',
  'typescript',
  `it('passes trivially', () => { expect(1).toBe(1); });`,
  r => {
    expect(!r.passed, 'tautological-only test should fail');
    expect(rules(r).includes('tautological_assertion'), 'should flag tautological_assertion', r.issues);
  }
);

await check(
  'hollow: tautological expect(true).toBeTruthy()',
  'typescript',
  `it('trivially truthy', () => { expect(true).toBeTruthy(); });`,
  r => {
    expect(!r.passed, 'tautological no-arg matcher should fail');
    expect(rules(r).includes('tautological_assertion'), 'should flag tautological_assertion', r.issues);
  }
);

await check(
  'hollow: tautological expect(null).toBeNull()',
  'typescript',
  `it('null is null', () => { expect(null).toBeNull(); });`,
  r => {
    expect(!r.passed, 'expect(null).toBeNull() should fail', r.issues);
    expect(rules(r).includes('tautological_assertion'), 'should flag tautological_assertion', r.issues);
  }
);

await check(
  'not tautological: expect(result).toBe(5) where result is a variable',
  'typescript',
  `it('checks variable', () => { const result = add(2, 3); expect(result).toBe(5); });`,
  r => {
    expect(r.passed, 'assertion on variable should NOT be flagged tautological', r.issues);
    expect(!rules(r).includes('tautological_assertion'), 'should NOT flag tautological', r.issues);
  }
);

await check(
  'not tautological: expect(1).toBe(2) — literals but unequal (caught elsewhere)',
  'typescript',
  `it('unequal literals', () => { expect(1).toBe(2); });`,
  r => {
    // This one would actually FAIL at runtime. Our detector doesn't flag it
    // as tautological because the sides aren't equal. That's correct — the
    // test author presumably meant to assert something.
    expect(!rules(r).includes('tautological_assertion'), 'unequal literals should NOT be tautological', r.issues);
  }
);

await check(
  'warning: mock-only test',
  'javascript',
  `
  it('only configures mocks', () => {
    const fn = jest.fn();
    fn.mockReturnValue(42);
    expect(fn()).toBe(42);
  });
  `,
  r => {
    // fn() is a "non-mock call" in our accounting — that's correct, it's
    // actually invoking the mock. So this test should NOT trigger mock_only.
    // This fixture actually exercises a mock's behavior properly.
    expect(r.totalTests === 1, 'one test', r);
    // If we have any mock_only warnings here it's a false positive
    const mockOnly = rules(r).includes('mock_only');
    if (mockOnly) console.error('    note: mock_only flagged — possible false positive depending on taste', r.issues);
  }
);

await check(
  'warning: silent catch',
  'typescript',
  `
  it('swallows errors', () => {
    try {
      doThing();
    } catch (e) {}
    expect(true).toBe(true);
  });
  `,
  r => {
    expect(rules(r).includes('silent_catch'), 'should flag silent_catch', r.issues);
  }
);

await check(
  'multiple tests: mixed healthy + hollow',
  'typescript',
  `
  it('healthy', () => { const r = compute(); expect(r).toBeGreaterThan(0); });
  it('hollow', () => { expect(true).toBe(true); });
  it('empty', () => {});
  `,
  r => {
    expect(r.totalTests === 3, 'three tests', r);
    expect(!r.passed, 'mixed should fail overall');
    const ruleSet = new Set(rules(r));
    expect(ruleSet.has('tautological_assertion'), 'flags hollow as tautological', r.issues);
    expect(ruleSet.has('empty_body'), 'flags empty_body', r.issues);
    // Healthy one should NOT produce issues attributed to it
    const healthyIssues = r.issues.filter(i => i.testName === 'healthy');
    expect(healthyIssues.length === 0, 'healthy test has no issues', healthyIssues);
  }
);

await check(
  'low density aggregate warning',
  'typescript',
  `
  it('a', () => { const x = compute(); });
  it('b', () => { const y = compute(); });
  it('c', () => { const z = compute(); });
  `,
  r => {
    expect(r.totalAssertions === 0, 'zero total assertions', r);
    expect(rules(r).includes('low_density'), 'aggregate low_density warning', r.issues);
    // Individual zero_assertions issues too
    expect(rules(r).filter(x => x === 'zero_assertions').length === 3, 'zero_assertions on each', r.issues);
  }
);

await check(
  'parse-error recovery: malformed TS',
  'typescript',
  `it('broken', () => { const x = ;; };`,
  r => {
    expect(r.supported, 'still marked supported', r);
    // Parser has errorRecovery: true, so it may succeed. Either outcome is acceptable
    // as long as we don't throw.
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  Python
// ═══════════════════════════════════════════════════════════════════════

await check(
  'healthy Python pytest test',
  'python',
  `
def test_addition():
    result = add(2, 3)
    assert result == 5

def test_subtraction():
    assert subtract(5, 3) == 2
  `,
  r => {
    expect(r.passed, 'healthy Python passes');
    expect(r.totalTests === 2, 'two tests', r);
    expect(r.totalAssertions === 2, 'two assertions', r);
    expect(r.issues.length === 0, 'no issues', r.issues);
  }
);

await check(
  'hollow Python: assert True',
  'python',
  `
def test_trivial():
    assert True
  `,
  r => {
    expect(!r.passed, 'assert True should fail');
    expect(rules(r).includes('tautological_assertion'), 'flags tautological', r.issues);
  }
);

await check(
  'hollow Python: assert 1 == 1',
  'python',
  `
def test_self_equal():
    assert 1 == 1
  `,
  r => {
    expect(!r.passed, 'assert 1 == 1 should fail');
    expect(rules(r).includes('tautological_assertion'), 'flags tautological', r.issues);
  }
);

await check(
  'hollow Python: empty test (pass)',
  'python',
  `
def test_pass_only():
    pass
  `,
  r => {
    expect(!r.passed, 'pass-only test should fail');
    expect(rules(r).includes('empty_body'), 'flags empty_body', r.issues);
  }
);

await check(
  'hollow Python: no assertions',
  'python',
  `
def test_runs_code():
    x = 1 + 1
    y = x * 2
    print(y)
  `,
  r => {
    expect(!r.passed, 'no-assertion Python should fail');
    expect(rules(r).includes('zero_assertions'), 'flags zero_assertions', r.issues);
  }
);

await check(
  'hollow Python: unittest self.assertEqual(1, 1)',
  'python',
  `
class TestThing(unittest.TestCase):
    def test_trivial(self):
        self.assertEqual(1, 1)
  `,
  r => {
    expect(!r.passed, 'self.assertEqual(1,1) should fail');
    expect(rules(r).includes('tautological_assertion'), 'flags tautological', r.issues);
  }
);

await check(
  'healthy Python with self.assertEqual on variable',
  'python',
  `
class TestThing(unittest.TestCase):
    def test_compute(self):
        result = compute(5)
        self.assertEqual(result, 25)
  `,
  r => {
    expect(r.passed, 'assertEqual on variable passes', r.issues);
    expect(rules(r).length === 0, 'no issues', r.issues);
  }
);

await check(
  'Python silent except',
  'python',
  `
def test_swallows():
    try:
        thing()
    except:
        pass
    assert True
  `,
  r => {
    expect(rules(r).includes('silent_catch'), 'flags silent_catch', r.issues);
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  Unsupported languages
// ═══════════════════════════════════════════════════════════════════════

await check('unsupported: Go', 'go', 'func TestAdd(t *testing.T) {}', r => {
  expect(!r.supported, 'Go marked unsupported');
  expect(r.passed, 'unsupported → passed=true (lenient)');
});

// ═══════════════════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
if (failures === 0) {
  console.log(`✅ Anti-hollow detector: ${checks}/${checks} checks passed`);
  process.exit(0);
} else {
  console.log(`❌ Anti-hollow detector: ${failures}/${checks} checks FAILED`);
  process.exit(1);
}
