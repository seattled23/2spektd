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

# Pattern 1: Functions with only 'pass'
echo "[1/3] Checking for pass-only functions..."
pass_only=$(rg -n 'def .+:\s+pass$' "$COMPONENT" || true)

if [[ -n "$pass_only" ]]; then
    echo "❌ Found pass-only functions:"
    echo "$pass_only" | head -10
    echo ""
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No pass-only functions"
fi
echo ""

# Pattern 2: Tests without assert statements
echo "[2/3] Checking for tests without assertions..."
test_files=$(fd -e py -g '*_test.py' -g 'test_*.py' . "$COMPONENT" || true)

if [[ -n "$test_files" ]]; then
    tests_without_assertions=0

    while IFS= read -r test_file; do
        # Find test_ functions without assert
        test_funcs=$(rg -n '^def test_' "$test_file" || true)

        if [[ -z "$test_funcs" ]]; then
            continue
        fi

        while IFS= read -r test_line; do
            line_num=$(echo "$test_line" | cut -d: -f1)

            # Get next 30 lines
            end_line=$((line_num + 30))
            block=$(sed -n "${line_num},${end_line}p" "$test_file")

            # Check for assert
            has_assertion=$(echo "$block" | grep -c 'assert ' || true)

            if [[ $has_assertion -eq 0 ]]; then
                echo "  ❌ Test without assertion at $test_file:$line_num"
                tests_without_assertions=$((tests_without_assertions + 1))
            fi
        done <<< "$test_funcs"
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

# Pattern 3: Silent exception handling (except: pass)
echo "[3/3] Checking for silent exception swallowing..."
silent_errors=$(rg -U -n 'except[^:]*:\s+pass' "$COMPONENT" || true)

if [[ -n "$silent_errors" ]]; then
    echo "❌ Found silent exception swallowing:"
    echo "$silent_errors" | head -10
    echo ""
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No silent exception swallowing"
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
    echo "  - Implementing real logic instead of 'pass'"
    echo "  - Adding assert statements to tests"
    echo "  - Properly handling exceptions (log or raise)"
    exit 23
else
    echo "✅ Layer 3: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
