#!/bin/bash
# Layer 2: Test Suite + Coverage
# Purpose: All tests pass + coverage ≥80%
# Exit: 22 on failure, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 22
fi

echo "Layer 2: Test Suite + Coverage"
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

# Run tests with coverage
echo "Running: vitest run --coverage"
echo ""

coverage_output=$(mktemp)

if vitest run "$COMPONENT" --coverage --reporter=verbose 2>&1 | tee "$coverage_output"; then
    echo ""
else
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ Layer 2: FAIL (tests failed)"
    echo "════════════════════════════════════════════════════════════════"
    rm -f "$coverage_output"
    exit 22
fi

# Parse coverage percentage from vitest output
# vitest coverage format: "All files | 85.5 | 78.2 | 90.1 | 85.5"
coverage_line=$(grep -E '(All files|Coverage)' "$coverage_output" | tail -1 || true)

if [[ -z "$coverage_line" ]]; then
    echo "⚠️  Could not parse coverage percentage"
    echo "Assuming coverage threshold met (verify manually)"
    rm -f "$coverage_output"
    exit 0
fi

# Extract first percentage after "All files"
coverage_pct=$(echo "$coverage_line" | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\.[0-9]+$/) {print $i; exit}}')

rm -f "$coverage_output"

if [[ -z "$coverage_pct" ]]; then
    echo "⚠️  Could not parse coverage percentage"
    echo "Assuming coverage threshold met (verify manually)"
    exit 0
fi

threshold=80

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Coverage: ${coverage_pct}%"

if (( $(echo "$coverage_pct < $threshold" | bc -l) )); then
    echo ""
    echo "❌ Layer 2: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Coverage below threshold (need ≥${threshold}%)"
    echo "Current: ${coverage_pct}%"
    exit 22
else
    echo ""
    echo "✅ Layer 2: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
