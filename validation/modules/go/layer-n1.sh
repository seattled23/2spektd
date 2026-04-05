#!/bin/bash
# Layer -1: Self-Validation (Go)
# Purpose: Build, vet, and test — basic sanity check
# Exit 0 = PASS, 11 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    echo "Example: $0 pkg/fhir"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer -1: Self-Validation"
echo "Component: $COMPONENT"
echo ""

# Check component exists
if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component directory not found: $COMPONENT"
    exit 11
fi

# Step 1: Build
echo "[1/3] Building..."
if ! go build ./"$COMPONENT"/...; then
    echo "❌ Build failed"
    exit 11
fi
echo "✅ Build passed"
echo ""

# Step 2: Vet
echo "[2/3] Running go vet..."
if ! go vet ./"$COMPONENT"/...; then
    echo "❌ go vet failed"
    exit 11
fi
echo "✅ go vet passed"
echo ""

# Step 3: Test (race detector + count=1 for no caching)
echo "[3/3] Running tests..."
if ! go test -race -count=1 ./"$COMPONENT"/...; then
    echo "❌ Tests failed"
    exit 11
fi
echo "✅ Tests passed"
echo ""

echo "=== Layer -1: PASS ==="
exit 0
