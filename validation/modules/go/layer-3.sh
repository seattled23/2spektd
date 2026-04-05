#!/bin/bash
# Layer 3: Anti-Hollow (Go)
# Purpose: Detect empty/hollow implementations
# Exit 0 = PASS, 23 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 3: Anti-Hollow Patterns"
echo "Component: $COMPONENT"
echo ""

hollow_count=0

# Pattern 1: Functions with only "return nil"
echo "[1/3] Checking for empty return functions..."
empty_returns=$(rg -n 'func .+\{[[:space:]]*return nil[[:space:]]*\}' "$COMPONENT" || true)
if [[ -n "$empty_returns" ]]; then
    echo "❌ Found functions with only 'return nil':"
    echo "$empty_returns"
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No empty return functions"
fi
echo ""

# Pattern 2: Test functions without assertions
echo "[2/3] Checking for tests without assertions..."
test_files=$(fd -e go . "$COMPONENT" | grep '_test\.go$' || true)
if [[ -n "$test_files" ]]; then
    for file in $test_files; do
        # Find test functions that don't contain assert/require/Error/Fail
        hollow_tests=$(awk '
            /^func Test/ {
                start = NR
                in_test = 1
                buffer = ""
                brace_count = 0
            }
            in_test {
                buffer = buffer "\n" $0
                brace_count += gsub(/\{/, "{", $0)
                brace_count -= gsub(/\}/, "}", $0)
                if (brace_count == 0 && in_test) {
                    # Check if buffer contains any assertion
                    if (buffer !~ /(assert|require|Error|Fail|Equal|NotEqual|True|False)/) {
                        print FILENAME ":" start ": " substr(buffer, 1, 60) "..."
                    }
                    in_test = 0
                }
            }
        ' "$file" || true)

        if [[ -n "$hollow_tests" ]]; then
            echo "❌ $file: Tests without assertions:"
            echo "$hollow_tests"
            hollow_count=$((hollow_count + 1))
        fi
    done

    if [[ $hollow_count -eq 0 ]]; then
        echo "✅ All tests have assertions"
    fi
else
    echo "⚠️  No test files found"
fi
echo ""

# Pattern 3: Silent error swallowing (err != nil with empty block)
echo "[3/3] Checking for silent error swallowing..."
silent_errors=$(rg -U -n 'if err != nil \{[[:space:]]*\}' "$COMPONENT" || true)
if [[ -n "$silent_errors" ]]; then
    echo "❌ Found silent error swallowing:"
    echo "$silent_errors"
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No silent error swallowing"
fi
echo ""

# Check allowlist for known false positives
allowlist_file=".outline/outline-strong/hollow-allowlist.txt"
if [[ -f "$allowlist_file" ]]; then
    echo "ℹ️  Allowlist file exists: $allowlist_file"
    echo "   (False positives should be documented there)"
    echo ""
fi

if [[ $hollow_count -gt 0 ]]; then
    echo "❌ $hollow_count hollow patterns detected"
    echo ""
    echo "If these are false positives, document in: $allowlist_file"
    exit 23
fi

echo "=== Layer 3: PASS ==="
exit 0
