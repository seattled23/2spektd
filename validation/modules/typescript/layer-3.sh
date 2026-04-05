#!/bin/bash
# Layer 3: Anti-Hollow Patterns
# Purpose: Detect empty/trivial implementations
# Exit: 23 on hollow patterns, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 23
fi

echo "Layer 3: Anti-Hollow Patterns"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 23
fi

echo "Component: $COMPONENT"
echo ""

hollow_count=0

# Pattern 1: Functions returning only null/undefined
echo "[1/3] Checking for empty return functions..."
empty_returns=$(rg -n 'function .+\{[[:space:]]*(return (null|undefined);?)?[[:space:]]*\}' "$COMPONENT" || true)

if [[ -n "$empty_returns" ]]; then
    echo "❌ Found empty return functions:"
    echo "$empty_returns" | head -10
    echo ""
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No empty return functions"
fi
echo ""

# Pattern 2: Tests without expect() assertions
echo "[2/3] Checking for tests without assertions..."
test_files=$(fd -e test.ts -e test.tsx -e spec.ts . "$COMPONENT" || true)

if [[ -n "$test_files" ]]; then
    tests_without_assertions=0

    while IFS= read -r test_file; do
        # Find test/it blocks without expect
        test_blocks=$(rg -n '(test|it)\(' "$test_file" || true)

        if [[ -z "$test_blocks" ]]; then
            continue
        fi

        while IFS= read -r test_line; do
            line_num=$(echo "$test_line" | cut -d: -f1)

            # Get next 20 lines
            end_line=$((line_num + 20))
            block=$(sed -n "${line_num},${end_line}p" "$test_file")

            # Check for expect/assert
            has_assertion=$(echo "$block" | grep -c -E '(expect|assert)\(' || true)

            if [[ $has_assertion -eq 0 ]]; then
                echo "  ❌ Test without assertion at $test_file:$line_num"
                tests_without_assertions=$((tests_without_assertions + 1))
            fi
        done <<< "$test_blocks"
    done <<< "$test_files"

    if [[ $tests_without_assertions -gt 0 ]]; then
        echo "❌ Found $tests_without_assertions tests without assertions"
        hollow_count=$((hollow_count + 1))
    else
        echo "✅ All tests have assertions"
    fi
else
    echo "⚠️  No test files found"
fi
echo ""

# Pattern 3: Silent error swallowing (catch {})
echo "[3/3] Checking for silent error swallowing..."
silent_errors=$(rg -U -n 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}' "$COMPONENT" || true)

if [[ -n "$silent_errors" ]]; then
    echo "❌ Found silent error swallowing:"
    echo "$silent_errors" | head -10
    echo ""
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No silent error swallowing"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"

if [[ $hollow_count -gt 0 ]]; then
    echo "❌ Layer 3: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Found $hollow_count hollow pattern(s)"
    echo ""
    echo "Fix by:"
    echo "  - Implementing real logic in functions"
    echo "  - Adding expect() assertions to tests"
    echo "  - Properly handling errors (log or rethrow)"
    exit 23
else
    echo "✅ Layer 3: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
