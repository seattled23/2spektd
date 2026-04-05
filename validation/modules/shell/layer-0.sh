#!/bin/bash
# Layer 0: Static Analysis
# Purpose: shellcheck linting
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

# Find all shell scripts
sh_files=$(fd -e sh . "$COMPONENT" || true)

if [[ -z "$sh_files" ]]; then
    echo "⚠️  No shell scripts found in $COMPONENT"
    exit 0
fi

echo "Running: shellcheck"
echo ""

failed=0

while IFS= read -r file; do
    if shellcheck "$file"; then
        echo "✅ $(basename "$file")"
    else
        echo "❌ $(basename "$file")"
        failed=$((failed + 1))
    fi
    echo ""
done <<< "$sh_files"

echo "════════════════════════════════════════════════════════════════"

if [[ $failed -gt 0 ]]; then
    echo "❌ Layer 0: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "$failed file(s) failed shellcheck"
    exit 10
else
    echo "✅ Layer 0: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
