/**
 * Go codegen prompt additions (Wave 6).
 *
 * Appended to the generic codegen prompt in codegen.ts when the language
 * pack resolves to 'go'. Content targets the minimum guardrails that the
 * Go quality adapters (golangci-lint, go vet, gosec, gofmt) will enforce
 * post-generation — saving the LLM a regen round by putting the rules
 * up-front.
 */

export const GO_CODEGEN_PROMPT = `
**Go idioms (MANDATORY — violations will be caught by golangci-lint / go vet / gosec):**

1. **Error handling** — return \`(T, error)\` tuples; no panics in library code.
   Wrap errors with \`fmt.Errorf("context: %w", err)\` to preserve the chain.
   Never ignore an error return; if intentional, use \`_ = f()\` with a comment.

2. **Imports** — group in this order with blank-line separators:
   \`\`\`go
   import (
       "context"        // stdlib
       "fmt"

       "github.com/pkg/errors"  // third-party

       "myproject/internal/x"   // internal
   )
   \`\`\`
   Only import packages that actually exist on pkg.go.dev or in the Go
   stdlib. Never invent module paths. Avoid placeholder domains
   (\`example.com/*\`, \`example.org/*\`).

3. **Tests** — file name \`<source>_test.go\`, same package or
   \`<name>_test\` for external tests. Functions signature
   \`func TestXxx(t *testing.T)\` (Xxx starts uppercase).

   Every test MUST contain at least one real assertion:
   - \`t.Error(...)\`, \`t.Errorf(...)\`, \`t.Fatal(...)\`, \`t.Fatalf(...)\`
   - or an assertion-library call (\`assert.Equal\`, \`require.NoError\`, etc.)

   Do NOT write tests whose bodies contain only \`t.Log\` / \`t.Logf\`, or whose
   only check is tautological (\`if 1 == 1\`, \`if true\`). Spec2 rejects these.

4. **Formatting** — must pass \`gofmt -l\` (no diff). Tabs for indentation,
   no trailing spaces, canonical brace placement.

5. **Security** — no hardcoded credentials, no use of \`crypto/md5\` or
   \`crypto/sha1\` for security-sensitive hashing, no \`fmt.Sprintf\`-built
   SQL queries (use parameterized queries via \`database/sql\`). gosec will
   reject these.

6. **Context propagation** — any function that performs I/O or long-running
   work takes \`ctx context.Context\` as its first parameter. Respect
   \`ctx.Done()\` for cancellation.

7. **Visibility** — exported identifiers (starting with an uppercase letter)
   must have a doc comment starting with the identifier name:
   \`// Foo does X. Returns ErrBar when...\`

8. **Concurrency** — if goroutines are spawned, document shutdown semantics.
   Use \`sync.WaitGroup\` or \`errgroup.Group\`, never bare goroutines that
   outlive the caller without a lifecycle contract.
`.trim();
