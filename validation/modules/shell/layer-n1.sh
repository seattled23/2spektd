#!/bin/bash
# Layer -1: Self-Validation
# Purpose: Syntax check for all shell scripts
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

# Find all shell scripts
sh_files=$(fd -e sh . "$COMPONENT" || true)

if [[ -z "$sh_files" ]]; then
    echo "⚠️  No shell scripts found in $COMPONENT"
    exit 0
fi

syntax_errors=0

echo "Syntax checking..."
echo ""

while IFS= read -r file; do
    # Check shebang
    first_line=$(head -1 "$file")
    if [[ ! "$first_line" =~ ^#!/bin/(bash|sh) ]]; then
        echo "  ⚠️  $(basename "$file"): Missing or invalid shebang"
    fi

    # Syntax check
    if bash -n "$file" 2>&1; then
        echo "  ✅ $(basename "$file")"
    else
        echo "  ❌ $(basename "$file"): Syntax error"
        syntax_errors=$((syntax_errors + 1))
    fi
done <<< "$sh_files"

echo ""
echo "════════════════════════════════════════════════════════════════"

if [[ $syntax_errors -gt 0 ]]; then
    echo "❌ Layer -1: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Found $syntax_errors syntax error(s)"
    exit 11
else
    echo "✅ Layer -1: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
