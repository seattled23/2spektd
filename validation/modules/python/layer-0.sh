#!/bin/bash
# Layer 0: Static Analysis
# Purpose: Strict type checking with pyright --strict
# Exit: 10 on failure, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 10
fi

echo "Layer 0: Static Analysis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 10
fi

echo "Component: $COMPONENT"
echo ""

# Run strict type checking
echo "Running: pyright (with strict mode from pyrightconfig.json)"
echo ""

output=$(pyright "$COMPONENT" 2>&1)
echo "$output"

if echo "$output" | rg -q "^0 errors"; then
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 0: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ Layer 0: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Type errors detected. Fix before proceeding."
    exit 10
fi
