#!/bin/bash
# Layer 10: Determinism
# Purpose: Verify tests produce identical results across runs
# Exit: 30 on non-deterministic, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 30
fi

echo "Layer 10: Determinism"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 30
fi

echo "Component: $COMPONENT"
echo ""

# Run tests twice and compare results
echo "Running tests (attempt 1/2)..."
output1=$(mktemp)
if vitest run "$COMPONENT" --reporter=json > "$output1" 2>&1; then
    echo "  ✅ Tests passed"
else
    echo "  ❌ Tests failed on first run"
    rm -f "$output1"
    exit 30
fi

echo ""
echo "Running tests (attempt 2/2)..."
output2=$(mktemp)
if vitest run "$COMPONENT" --reporter=json > "$output2" 2>&1; then
    echo "  ✅ Tests passed"
else
    echo "  ❌ Tests failed on second run"
    rm -f "$output1" "$output2"
    exit 30
fi

echo ""
echo "Comparing results..."

# Compare test outputs (ignore timestamps)
# Extract just test names and pass/fail status
result1=$(mktemp)
result2=$(mktemp)

# Parse JSON output for test results (simplified - just check if outputs are identical)
# In production, would use jql to extract test results array
if diff -u "$output1" "$output2" > /dev/null 2>&1; then
    echo "  ✅ Outputs identical"
    identical=0
else
    echo "  ⚠️  Outputs differ (checking test results only...)"

    # Try to extract just test results (names + status)
    # This is a simplified check - production would parse JSON properly
    jq -r '.testResults[]? | "\(.name) \(.status)"' "$output1" 2>/dev/null | sort > "$result1" || echo "parse_failed" > "$result1"
    jq -r '.testResults[]? | "\(.name) \(.status)"' "$output2" 2>/dev/null | sort > "$result2" || echo "parse_failed" > "$result2"

    if diff -u "$result1" "$result2" > /dev/null 2>&1; then
        echo "  ✅ Test results identical (metadata differs, acceptable)"
        identical=0
    else
        echo "  ❌ Test results differ"
        echo ""
        echo "Diff:"
        diff -u "$result1" "$result2" | head -20 || true
        identical=1
    fi
fi

rm -f "$output1" "$output2" "$result1" "$result2"

echo ""
echo "════════════════════════════════════════════════════════════════"

if [[ $identical -ne 0 ]]; then
    echo "❌ Layer 10: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Tests are non-deterministic"
    echo "Common causes:"
    echo "  - Random data generation without seeding"
    echo "  - Timestamp dependencies"
    echo "  - Unordered collections (Set, Map iteration)"
    echo "  - Race conditions in async code"
    exit 30
else
    echo "✅ Layer 10: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
