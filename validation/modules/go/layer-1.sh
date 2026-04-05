#!/bin/bash
# Layer 1: Contracts (Go)
# Purpose: Check all exported functions have @pre/@post/@error annotations
# Exit 0 = PASS, 21 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 1: Contract Annotations"
echo "Component: $COMPONENT"
echo ""

# Find all .go files (excluding _test.go)
go_files=$(fd -e go --exclude '*_test.go' . "$COMPONENT")

if [[ -z "$go_files" ]]; then
    echo "⚠️  No .go files found in $COMPONENT"
    exit 0
fi

missing_contracts=0

# For each .go file, find exported functions and check for contracts
for file in $go_files; do
    echo "Checking $file..."

    # Extract exported function declarations (starting with capital letter)
    exported_funcs=$(grep -n '^func [A-Z]' "$file" | cut -d: -f1 || true)

    if [[ -z "$exported_funcs" ]]; then
        continue
    fi

    while IFS= read -r line_num; do
        # Get function name
        func_name=$(sed -n "${line_num}p" "$file" | grep -oP '^func \K[A-Za-z0-9_]+')

        # Check previous 10 lines for @pre, @post, @error
        start=$((line_num - 10))
        if [[ $start -lt 1 ]]; then
            start=1
        fi

        context=$(sed -n "${start},${line_num}p" "$file")

        has_pre=$(echo "$context" | grep -c '@pre:' || true)
        has_post=$(echo "$context" | grep -c '@post:' || true)
        has_error=$(echo "$context" | grep -c '@error:' || true)

        if [[ $has_pre -eq 0 || $has_post -eq 0 || $has_error -eq 0 ]]; then
            echo "  ❌ $func_name (line $line_num): Missing contracts"
            if [[ $has_pre -eq 0 ]]; then
                echo "     - Missing @pre"
            fi
            if [[ $has_post -eq 0 ]]; then
                echo "     - Missing @post"
            fi
            if [[ $has_error -eq 0 ]]; then
                echo "     - Missing @error"
            fi
            missing_contracts=$((missing_contracts + 1))
        else
            echo "  ✅ $func_name (line $line_num): Contracts present"
        fi
    done <<< "$exported_funcs"
done

echo ""

if [[ $missing_contracts -gt 0 ]]; then
    echo "❌ $missing_contracts exported functions missing contracts"
    echo ""
    echo "Contract format:"
    echo "// FunctionName does X"
    echo "// @pre: condition (e.g., r is valid stream)"
    echo "// @post: result OR error returned"
    echo "// @error: error cases"
    echo "func FunctionName(...) {...}"
    exit 21
fi

echo "=== Layer 1: PASS ==="
exit 0
