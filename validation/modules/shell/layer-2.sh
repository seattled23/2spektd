#!/bin/bash
# Layer 2: Test Suite
# Purpose: bats tests
# Exit: 22 on failure, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 22
fi

echo "Layer 2: Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 22
fi

echo "Component: $COMPONENT"
echo ""

# Find bats test files
test_files=$(fd -e bats . "$COMPONENT" || true)
if [[ -z "$test_files" ]]; then
    test_files=$(fd -g 'test_*.sh' . "$COMPONENT" || true)
fi

if [[ -z "$test_files" ]]; then
    echo "⚠️  No test files found (*.bats or test_*.sh)"
    echo "Skipping test execution"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 2: PASS (no tests)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

echo "Found test files:"
echo "$test_files"
echo ""

# Run tests
if command -v bats &> /dev/null; then
    echo "Running: bats"
    echo ""

    if bats "$COMPONENT"; then
        echo ""
        echo "════════════════════════════════════════════════════════════════"
        echo "✅ Layer 2: PASS"
        echo "════════════════════════════════════════════════════════════════"
        exit 0
    else
        echo ""
        echo "════════════════════════════════════════════════════════════════"
        echo "❌ Layer 2: FAIL"
        echo "════════════════════════════════════════════════════════════════"
        exit 22
    fi
else
    echo "⚠️  bats not found, running test scripts directly..."
    echo ""

    failed=0

    while IFS= read -r test_file; do
        echo "Running: $test_file"
        if bash "$test_file"; then
            echo "✅ Passed"
        else
            echo "❌ Failed"
            failed=$((failed + 1))
        fi
        echo ""
    done <<< "$test_files"

    echo "════════════════════════════════════════════════════════════════"

    if [[ $failed -gt 0 ]]; then
        echo "❌ Layer 2: FAIL"
        echo "════════════════════════════════════════════════════════════════"
        exit 22
    else
        echo "✅ Layer 2: PASS"
        echo "════════════════════════════════════════════════════════════════"
        exit 0
    fi
fi
