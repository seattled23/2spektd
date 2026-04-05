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

# Pattern 1: Empty functions (just return or :)
echo "[1/3] Checking for empty functions..."
empty_funcs=$(rg -n 'function .+\{[[:space:]]*(return|:)[[:space:]]*\}' "$COMPONENT" || true)

if [[ -n "$empty_funcs" ]]; then
    echo "❌ Found empty functions:"
    echo "$empty_funcs" | head -10
    echo ""
    hollow_count=$((hollow_count + 1))
else
    echo "✅ No empty functions"
fi
echo ""

# Pattern 2: Tests without assertions (bats or manual tests)
echo "[2/3] Checking for tests without assertions..."
test_files=$(fd -e bats -g 'test_*.sh' . "$COMPONENT" || true)

if [[ -n "$test_files" ]]; then
    tests_without_assertions=0

    while IFS= read -r test_file; do
        # Find test blocks
        test_blocks=$(rg -n '@test|function test_' "$test_file" || true)

        if [[ -z "$test_blocks" ]]; then
            continue
        fi

        while IFS= read -r test_line; do
            line_num=$(echo "$test_line" | cut -d: -f1)

            # Get next 20 lines
            end_line=$((line_num + 20))
            block=$(sed -n "${line_num},${end_line}p" "$test_file")

            # Check for assertions (bats: [, test, assert_*, or general: grep, diff, etc.)
            has_assertion=$(echo "$block" | grep -c -E '(\[|test |assert_|grep |diff )' || true)

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

# Pattern 3: Unhandled errors (no 'set -e' and no error checks)
echo "[3/3] Checking for unhandled errors..."
scripts_without_set_e=0

sh_files=$(fd -e sh --exclude 'test_*.sh' . "$COMPONENT" || true)

if [[ -n "$sh_files" ]]; then
    while IFS= read -r file; do
        # Check if file has 'set -e' or 'set -o errexit'
        has_errexit=$(grep -c -E '^set -[a-z]*e|^set -o errexit' "$file" || true)

        if [[ $has_errexit -eq 0 ]]; then
            echo "  ⚠️  $(basename "$file"): No 'set -e' (errors not fatal)"
            scripts_without_set_e=$((scripts_without_set_e + 1))
        fi
    done <<< "$sh_files"

    if [[ $scripts_without_set_e -gt 0 ]]; then
        echo "❌ Found $scripts_without_set_e scripts without 'set -e'"
        hollow_count=$((hollow_count + 1))
    else
        echo "✅ All scripts use 'set -e'"
    fi
else
    echo "⚠️  No shell scripts found"
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
    echo "  - Adding assertions to tests ([ ... ], test, assert_*)"
    echo "  - Using 'set -e' in all scripts"
    exit 23
else
    echo "✅ Layer 3: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
