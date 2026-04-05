#!/bin/bash
# Layer 1: Contract Decorators
# Purpose: Check all public functions have @deal.pre/@deal.post/@deal.raises
# Exit: 21 on missing contracts, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 21
fi

echo "Layer 1: Contract Decorators"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 21
fi

echo "Component: $COMPONENT"
echo ""

# Find all Python files (exclude tests, __init__.py)
py_files=$(fd -e py --exclude '*_test.py' --exclude 'test_*.py' --exclude '__init__.py' . "$COMPONENT" || true)

if [[ -z "$py_files" ]]; then
    echo "⚠️  No Python files found in $COMPONENT"
    exit 0
fi

missing_contracts=0
total_public=0

echo "Checking contract decorators..."
echo ""

while IFS= read -r file; do
    echo "Checking: $file"

    # Extract public function declarations (not starting with _)
    public_funcs=$(rg -n '^def [a-z][A-Za-z0-9_]*\(' "$file" || true)

    if [[ -z "$public_funcs" ]]; then
        continue
    fi

    while IFS= read -r func_line; do
        line_num=$(echo "$func_line" | cut -d: -f1)
        func_decl=$(echo "$func_line" | cut -d: -f2-)
        func_name=$(echo "$func_decl" | sed -E 's/def ([a-zA-Z0-9_]+).*/\1/')

        total_public=$((total_public + 1))

        # Get previous 20 lines (decorators can span multiple lines)
        start_line=$((line_num - 20))
        if [[ $start_line -lt 1 ]]; then
            start_line=1
        fi

        context=$(sed -n "${start_line},${line_num}p" "$file")

        # Check for @deal decorators
        has_pre=$(echo "$context" | grep -c '@deal\.pre' || true)
        has_post=$(echo "$context" | grep -c '@deal\.post' || true)
        has_raises=$(echo "$context" | grep -c '@deal\.raises' || true)

        if [[ $has_pre -eq 0 || $has_post -eq 0 || $has_raises -eq 0 ]]; then
            echo "  ❌ $func_name (line $line_num): Missing contracts"
            if [[ $has_pre -eq 0 ]]; then echo "     - Missing @deal.pre"; fi
            if [[ $has_post -eq 0 ]]; then echo "     - Missing @deal.post"; fi
            if [[ $has_raises -eq 0 ]]; then echo "     - Missing @deal.raises"; fi
            missing_contracts=$((missing_contracts + 1))
        else
            echo "  ✅ $func_name (line $line_num)"
        fi
    done <<< "$public_funcs"

    echo ""
done <<< "$py_files"

echo "════════════════════════════════════════════════════════════════"
echo "Summary:"
echo "  Total public functions: $total_public"
echo "  Missing contracts: $missing_contracts"

if [[ $missing_contracts -gt 0 ]]; then
    echo ""
    echo "❌ Layer 1: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Add deal decorators to all public functions:"
    echo ""
    echo "import deal"
    echo ""
    echo "@deal.pre(lambda x: condition, message='...')"
    echo "@deal.post(lambda result: condition, message='...')"
    echo "@deal.raises(ExceptionType, ...)"
    echo "def function_name(...):"
    echo "    ..."
    exit 21
else
    echo ""
    echo "✅ Layer 1: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
