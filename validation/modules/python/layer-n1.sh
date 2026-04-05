#!/bin/bash
# Layer -1: Self-Validation
# Purpose: Import check + test (all must pass)
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

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 11
fi

echo "Component: $COMPONENT"
echo ""

# Step 1: Import check (compile all modules)
echo "[1/2] Import check..."
py_files=$(fd -e py --exclude '*_test.py' --exclude 'test_*.py' . "$COMPONENT" || true)

if [[ -z "$py_files" ]]; then
    echo "⚠️  No Python files found in $COMPONENT"
    exit 0
fi

import_errors=0

while IFS= read -r file; do
    if python -c "import py_compile; py_compile.compile('$file', doraise=True)" 2>&1; then
        echo "  ✅ $(basename "$file")"
    else
        echo "  ❌ $(basename "$file") - syntax error"
        import_errors=$((import_errors + 1))
    fi
done <<< "$py_files"

if [[ $import_errors -gt 0 ]]; then
    echo ""
    echo "❌ Import check failed ($import_errors errors)"
    exit 11
fi

echo ""

# Step 2: Tests
echo "[2/2] Running tests (pytest)..."
if pytest "$COMPONENT" -v --tb=short; then
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
