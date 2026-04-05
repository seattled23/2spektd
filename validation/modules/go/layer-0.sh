#!/bin/bash
# Layer 0: Static Analysis (Go)
# Purpose: go vet + staticcheck — no type errors, unused variables
# Exit 0 = PASS, 10 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 0: Static Analysis"
echo "Component: $COMPONENT"
echo ""

# Step 1: go vet (redundant with layer -1, but required per spec)
echo "[1/2] Running go vet..."
if ! go vet ./"$COMPONENT"/...; then
    echo "❌ go vet failed"
    exit 10
fi
echo "✅ go vet passed"
echo ""

# Step 2: staticcheck (advanced static analysis)
echo "[2/2] Running staticcheck..."
if ! staticcheck ./"$COMPONENT"/...; then
    echo "❌ staticcheck failed"
    exit 10
fi
echo "✅ staticcheck passed"
echo ""

echo "=== Layer 0: PASS ==="
exit 0
