#!/bin/bash
# Layer 2: Tests (Go)
# Purpose: Test suite with ≥80% coverage, race-clean
# Exit 0 = PASS, 22 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 2: Test Suite"
echo "Component: $COMPONENT"
echo ""

# Step 1: Run tests with coverage
echo "[1/2] Running tests with coverage..."
coverage_file=$(mktemp)
if ! go test -race -count=1 -cover -coverprofile="$coverage_file" ./"$COMPONENT"/...; then
    echo "❌ Tests failed"
    rm -f "$coverage_file"
    exit 22
fi

# Step 2: Check coverage percentage
echo ""
echo "[2/2] Checking coverage..."
coverage_pct=$(go tool cover -func="$coverage_file" | tail -1 | awk '{print $3}' | sed 's/%//')

echo "Coverage: $coverage_pct%"

# Threshold: ≥80%
threshold=80
if (( $(echo "$coverage_pct < $threshold" | bc -l) )); then
    echo "❌ Coverage below threshold (need ≥${threshold}%)"
    rm -f "$coverage_file"
    exit 22
fi

rm -f "$coverage_file"

echo "✅ Coverage meets threshold (≥${threshold}%)"
echo ""
echo "=== Layer 2: PASS ==="
exit 0
