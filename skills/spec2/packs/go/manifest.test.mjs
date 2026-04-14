#!/usr/bin/env node
/**
 * Unit tests for the Go language pack (§8.4 ship gate).
 *
 * Covers:
 *   - Hallucination detector: valid imports, 3+ hallucinated variants.
 *   - Hollow-test detector: 5+ hollow pattern variants + 1 healthy fixture.
 *   - Low-assertion-density aggregate warning.
 *   - Quality adapter smoke tests (conditional on tool binaries being
 *     installed — gofmt / go vet / golangci-lint / gosec).
 *
 * Run: node packs/go/manifest.test.mjs  (requires `npm run build` first).
 */

import { detectGoHallucinations } from '../../dist/packs/go/hallucination.js';
import { detectGoHollowTests } from '../../dist/packs/go/hollow-tests.js';
import { goPack } from '../../dist/packs/go/manifest.js';
import { getPack, listPacks } from '../../dist/packs/index.js';
import { runAdapter } from '../../dist/quality/adapter.js';
import { gofmtAdapter } from '../../dist/quality/adapters/go/gofmt.js';
import { goVetAdapter } from '../../dist/quality/adapters/go/govet.js';
import { golangciLintAdapter } from '../../dist/quality/adapters/go/golangci-lint.js';
import { gosecAdapter } from '../../dist/quality/adapters/go/gosec.js';

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

function rules(report) {
  return report.issues.map(i => i.rule);
}

// ═══════════════════════════════════════════════════════════════════════
//  Registry tests
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── registry: pack is registered ──');
{
  const p = getPack('go');
  expect(p !== undefined, 'getPack("go") returns a pack');
  expect(p?.id === 'go', 'pack.id == "go"');
  expect(p?.extensions[0] === 'go', 'first extension is "go"');
  expect(Array.isArray(p?.qualityTools) && p.qualityTools.length === 4, '4 quality adapters registered', p?.qualityTools?.map(a => a.id));
  expect(listPacks().some(x => x.id === 'go'), 'listPacks() includes go');
  expect(goPack.testFilePattern.test('foo_test.go'), 'testFilePattern matches foo_test.go');
  expect(!goPack.testFilePattern.test('foo.go'), 'testFilePattern does not match foo.go');
}

// ═══════════════════════════════════════════════════════════════════════
//  Hallucination detector
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── hallucination: valid stdlib + third-party ──');
{
  const code = `
    package main

    import (
      "context"
      "encoding/json"
      "fmt"

      "github.com/pkg/errors"
    )

    func main() { fmt.Println(context.TODO(), errors.New("x"), json.Marshal(nil)) }
  `;
  const r = await detectGoHallucinations(code);
  expect(r.passed, 'valid imports pass', r);
  expect(r.invalidImports.length === 0, 'zero invalid imports', r);
}

console.log('\n── hallucination: fake- prefix ──');
{
  const code = `
    package main
    import "fake-package/x"
    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(!r.passed, 'fake-* import flagged', r);
  expect(r.invalidImports.some(s => s.startsWith('fake-package/x')), 'fake-package/x in report', r);
}

console.log('\n── hallucination: generated- prefix ──');
{
  const code = `
    package main
    import "generated-stubs/mypkg"
    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(!r.passed, 'generated-* import flagged', r);
}

console.log('\n── hallucination: example.com placeholder ──');
{
  const code = `
    package main
    import "example.com/myorg/mypkg"
    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(!r.passed, 'example.com/* placeholder flagged', r);
}

console.log('\n── hallucination: your-org template leakage ──');
{
  const code = `
    package main
    import "your-org/your-module"
    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(!r.passed, 'your-org/* flagged', r);
}

console.log('\n── hallucination: dotless single-segment non-stdlib ──');
{
  const code = `
    package main
    import "bogusfoo"
    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(!r.passed, 'dotless single-segment non-stdlib flagged', r);
}

console.log('\n── hallucination: aliased + blank + dot imports ──');
{
  const code = `
    package main

    import (
      alias "context"
      _ "database/sql"
      . "strings"
    )

    func main() {}
  `;
  const r = await detectGoHallucinations(code);
  expect(r.passed, 'aliased/blank/dot imports of stdlib pass', r);
}

console.log('\n── hallucination: comment-inside-import does not confuse parser ──');
{
  const code = `
    package main
    import (
      // this is a stdlib import
      "fmt"
      /* block comment
         containing "fake-evil" */
      "context"
    )
    func main() { fmt.Println(context.TODO()) }
  `;
  const r = await detectGoHallucinations(code);
  expect(r.passed, 'commented-out fake-* does not trigger', r);
}

// ═══════════════════════════════════════════════════════════════════════
//  Hollow-test detector
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── hollow: healthy tests with real assertions ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestAddPositive(t *testing.T) {
      result := Add(2, 3)
      if result != 5 {
        t.Errorf("expected 5, got %d", result)
      }
    }

    func TestAddNegative(t *testing.T) {
      result := Add(-1, -2)
      if result != -3 {
        t.Fatalf("expected -3, got %d", result)
      }
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(r.passed, 'healthy tests pass', r);
  expect(r.totalTests === 2, `expected 2 tests, got ${r.totalTests}`, r);
  expect(r.totalAssertions === 2, `expected 2 assertions, got ${r.totalAssertions}`, r);
  expect(r.issues.length === 0, 'zero issues', r);
}

console.log('\n── hollow: zero-assertion body (only t.Log) ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestLogsOnly(t *testing.T) {
      t.Log("test ran")
      t.Logf("ran at %s", "noon")
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(!r.passed, 'log-only test fails', r);
  expect(rules(r).includes('zero_assertions'), 'zero_assertions reported', r);
}

console.log('\n── hollow: empty body ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestEmpty(t *testing.T) {
    }

    func TestEmptyWithComment(t *testing.T) {
      // TODO: write me
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(!r.passed, 'empty body fails', r);
  expect(rules(r).includes('empty_body'), 'empty_body reported', r);
}

console.log('\n── hollow: tautological assertion (if true) ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestTautological(t *testing.T) {
      if true {
        t.Error("unreachable in the sense that matters")
      }
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(rules(r).includes('tautological_assertion'), 'tautological_assertion reported', r);
}

console.log('\n── hollow: tautological assertion (1 == 1) ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestTautologicalNumeric(t *testing.T) {
      if 1 == 1 {
        t.Errorf("still tautological")
      }
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(rules(r).includes('tautological_assertion'), 'tautological_assertion reported for 1 == 1', r);
}

console.log('\n── hollow: silent recover ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestPanicSwallowed(t *testing.T) {
      defer func() {
        recover()
      }()
      doSomethingThatMightPanic()
      if result := doSomethingThatMightPanic(); result != 0 {
        t.Errorf("not zero")
      }
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(rules(r).includes('silent_catch'), 'silent_catch reported', r);
}

console.log('\n── hollow: low assertion density ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestA(t *testing.T) {
      if 1 != 2 {
        t.Error("x")
      }
    }

    func TestB(t *testing.T) {
      doWork()
      moreWork()
    }

    func TestC(t *testing.T) {
      setup()
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(rules(r).includes('low_density'), 'low_density reported', r);
  expect(rules(r).includes('zero_assertions'), 'zero_assertions on the asserting-less test', r);
}

console.log('\n── hollow: testify assert / require counted ──');
{
  const code = `
    package mypkg
    import (
      "testing"
      "github.com/stretchr/testify/assert"
      "github.com/stretchr/testify/require"
    )

    func TestTestifyAssert(t *testing.T) {
      got := Compute()
      assert.Equal(t, 42, got)
      require.NoError(t, validate(got))
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(r.passed, 'testify assertions counted', r);
  expect(r.totalAssertions >= 2, 'at least 2 assertions counted', r);
}

console.log('\n── hollow: mock_only (assertions exist but only mock calls) ──');
{
  // mock.On(...) / mock.EXPECT() are the detectable mock-setup patterns.
  // This body contains only those + one assertion — no real code exercised.
  const code = `
    package mypkg
    import (
      "testing"
      "github.com/stretchr/testify/mock"
    )

    func TestMockOnly(t *testing.T) {
      mock.On("DoThing")
      mock.On("Other")
      t.Error("no real code under test")
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(rules(r).includes('mock_only'), 'mock_only reported', r);
}

console.log('\n── hollow: subtests via t.Run count assertions ──');
{
  const code = `
    package mypkg
    import "testing"

    func TestWithSubtests(t *testing.T) {
      t.Run("case1", func(t *testing.T) {
        if 1 != 1 {
          t.Error("a")
        }
      })
      t.Run("case2", func(t *testing.T) {
        if 2 != 2 {
          t.Fatalf("b")
        }
      })
    }
  `;
  const r = await detectGoHollowTests(code);
  expect(r.totalTests === 1, 'outer TestX is one test unit', r);
  expect(r.totalAssertions >= 2, 'subtest assertions counted', r);
}

// ═══════════════════════════════════════════════════════════════════════
//  Quality adapter smoke tests (conditional — skip if tools missing).
// ═══════════════════════════════════════════════════════════════════════

async function smokeAdapter(adapter, code, expectFn) {
  const present = await adapter.detect();
  if (!present) {
    console.log(`  (skipped — ${adapter.id} not installed)`);
    return;
  }
  const report = await runAdapter(adapter, {
    code,
    path: 'sample.go',
    timeoutMs: 45_000,
  });
  expectFn(report);
}

console.log('\n── adapter: gofmt detects unformatted code ──');
await smokeAdapter(
  gofmtAdapter,
  // Two-space indent where tab required; trailing space after import.
  'package main \nimport  "fmt"\nfunc main()  {\n  fmt.Println("x")\n}\n',
  r => {
    expect(r.installed, 'gofmt detected as installed', r);
    expect(!r.errored, 'gofmt run did not error', r);
    expect(
      r.issues.some(i => i.rule === 'gofmt-drift' || i.rule === 'gofmt-parse-error'),
      'gofmt reported drift or parse-error',
      r.issues,
    );
  },
);

console.log('\n── adapter: gofmt passes on well-formatted code ──');
await smokeAdapter(
  gofmtAdapter,
  'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("x")\n}\n',
  r => {
    expect(r.installed, 'gofmt installed', r);
    expect(!r.errored, 'run ok', r);
    expect(r.issues.length === 0, 'zero issues on well-formatted code', r);
  },
);

console.log('\n── adapter: go vet flags unreachable code (errors-as-values) ──');
await smokeAdapter(
  goVetAdapter,
  // Printf format mismatch — classic go vet catch.
  'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Printf("%d\\n", "not-an-int")\n}\n',
  r => {
    expect(r.installed, 'go vet installed', r);
    expect(!r.errored || r.issues.length > 0, 'run produced a report or issues', r);
  },
);

console.log('\n── adapter: golangci-lint runs against a sample file ──');
await smokeAdapter(
  golangciLintAdapter,
  'package main\n\nimport "fmt"\n\nfunc main() {\n\tvar unused int\n\tfmt.Println("x")\n}\n',
  r => {
    expect(r.installed, 'golangci-lint installed', r);
    // Don't require specific issues — linter config varies. Just require no crash.
    expect(!r.errored, `run did not error: ${r.errorMessage ?? ''}`, r);
  },
);

console.log('\n── adapter: gosec runs against a sample file ──');
await smokeAdapter(
  gosecAdapter,
  'package main\n\nimport (\n\t"crypto/md5"\n\t"fmt"\n)\n\nfunc main() {\n\th := md5.Sum([]byte("x"))\n\tfmt.Println(h)\n}\n',
  r => {
    expect(r.installed, 'gosec installed', r);
    expect(!r.errored, `run did not error: ${r.errorMessage ?? ''}`, r);
    // MD5 usage triggers a gosec finding (G401 weak hash). If gosec ran, expect at least one issue.
    expect(r.issues.length > 0, 'gosec flagged MD5 weak hash (G401)', r.issues);
  },
);

// ═══════════════════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════════════════

console.log(`\n── summary ──`);
console.log(`  checks: ${checks}`);
console.log(`  failures: ${failures}`);
if (failures > 0) {
  process.exit(1);
}
