#!/bin/bash
# Layer 1: Contract Annotations
# Purpose: Check all exported functions have @pre/@post/@throws
# Exit: 21 on missing contracts, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 21
fi

echo "Layer 1: Contract Annotations"
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

# Find all TypeScript files (exclude test files)
ts_files=$(fd -e ts -e tsx --exclude '*.test.ts' --exclude '*.test.tsx' --exclude '*.spec.ts' . "$COMPONENT" || true)

if [[ -z "$ts_files" ]]; then
    echo "⚠️  No TypeScript files found in $COMPONENT"
    exit 0
fi

missing_contracts=0
total_exported=0

echo "Checking contract annotations..."
echo ""

while IFS= read -r file; do
    echo "Checking: $file"

    # Extract exported function declarations
    # Pattern: export function FunctionName OR export async function FunctionName
    exported_funcs=$(rg -n '^export (async )?function [A-Z]' "$file" || true)

    if [[ -z "$exported_funcs" ]]; then
        continue
    fi

    while IFS= read -r func_line; do
        line_num=$(echo "$func_line" | cut -d: -f1)
        func_decl=$(echo "$func_line" | cut -d: -f2-)
        func_name=$(echo "$func_decl" | sed -E 's/export (async )?function ([A-Za-z0-9_]+).*/\2/')

        total_exported=$((total_exported + 1))

        # Get previous 15 lines (TSDoc can be longer)
        start_line=$((line_num - 15))
        if [[ $start_line -lt 1 ]]; then
            start_line=1
        fi

        context=$(sed -n "${start_line},${line_num}p" "$file")

        # Check for @pre, @post, @throws in TSDoc
        has_pre=$(echo "$context" | grep -c '@pre' || true)
        has_post=$(echo "$context" | grep -c '@post' || true)
        has_throws=$(echo "$context" | grep -c '@throws' || true)

        if [[ $has_pre -eq 0 || $has_post -eq 0 || $has_throws -eq 0 ]]; then
            echo "  ❌ $func_name (line $line_num): Missing contracts"
            if [[ $has_pre -eq 0 ]]; then echo "     - Missing @pre"; fi
            if [[ $has_post -eq 0 ]]; then echo "     - Missing @post"; fi
            if [[ $has_throws -eq 0 ]]; then echo "     - Missing @throws"; fi
            missing_contracts=$((missing_contracts + 1))
        else
            echo "  ✅ $func_name (line $line_num)"
        fi
    done <<< "$exported_funcs"

    echo ""
done <<< "$ts_files"

echo "════════════════════════════════════════════════════════════════"
echo "Summary:"
echo "  Total exported functions: $total_exported"
echo "  Missing contracts: $missing_contracts"

if [[ $missing_contracts -gt 0 ]]; then
    echo ""
    echo "❌ Layer 1: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Add contract annotations to all exported functions:"
    echo ""
    echo "/**"
    echo " * Function description"
    echo " * @pre precondition (e.g., user is authenticated)"
    echo " * @post postcondition OR throws error"
    echo " * @throws ErrorType - when condition fails"
    echo " */"
    echo "export function FunctionName(...) { ... }"
    exit 21
else
    echo ""
    echo "✅ Layer 1: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
