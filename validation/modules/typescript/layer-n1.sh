#!/bin/bash
# Layer -1: Self-Validation
# Purpose: Build + lint + test (all must pass)
# Exit: 11 on failure, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 11
fi

echo "Layer -1: Self-Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Check if component exists
if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 11
fi

echo "Component: $COMPONENT"
echo ""

# Step 1: Type check
echo "[1/3] Type checking (tsc --noEmit)..."
if tsc --noEmit --project "$COMPONENT/tsconfig.json" 2>&1 | head -20; then
    echo "✅ Type check passed"
else
    echo ""
    echo "❌ Type check failed"
    exit 11
fi
echo ""

# Step 2: Lint
echo "[2/3] Linting (eslint)..."
if eslint "$COMPONENT" --max-warnings 0; then
    echo "✅ Lint passed"
else
    echo ""
    echo "❌ Lint failed"
    exit 11
fi
echo ""

# Step 3: Tests
echo "[3/3] Running tests (vitest)..."
if vitest run "$COMPONENT" --reporter=verbose --no-coverage; then
    echo "✅ Tests passed"
else
    echo ""
    echo "❌ Tests failed"
    exit 11
fi
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "✅ Layer -1: PASS"
echo "════════════════════════════════════════════════════════════════"
echo ""

exit 0
