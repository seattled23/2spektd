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
echo "Running: pytest --cov=$COMPONENT --cov-report=term --cov-fail-under=80"
echo ""

if pytest "$COMPONENT" --cov="$COMPONENT" --cov-report=term --cov-fail-under=80 -v; then
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
    echo ""
    echo "Either tests failed or coverage below 80%"
    exit 22
fi
