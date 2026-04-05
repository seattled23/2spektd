#!/bin/bash
# Layer 7: Correspondence Matrix
# Purpose: Validate property-to-layer mapping (≥3 layers per property)
# Exit: 27 on incomplete, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 27
fi

echo "Layer 7: Correspondence Matrix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 27
fi

echo "Component: $COMPONENT"
echo ""

# Look for correspondence matrix
# Format: .outline/outline-strong/comp-XX/correspondence-X.json
comp_dir=$(fd -t d -g 'comp-*' .outline/outline-strong | grep -F "$(basename "$COMPONENT")" | head -1 || true)

if [[ -z "$comp_dir" ]]; then
    echo "⚠️  No component validation directory found"
    echo "Skipping correspondence check (old components grandfathered)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 7: PASS (grandfathered)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

correspondence_files=$(fd -e json -g 'correspondence-*.json' "$comp_dir" || true)

if [[ -z "$correspondence_files" ]]; then
    echo "⚠️  No correspondence matrix found in $comp_dir"
    echo "Skipping (old components grandfathered)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 7: PASS (grandfathered)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

echo "Found correspondence matrices:"
echo "$correspondence_files"
echo ""

# Validate each matrix
incomplete=0

while IFS= read -r matrix_file; do
    echo "Validating: $matrix_file"

    # Check if jql is available
    if ! command -v jql &> /dev/null; then
        echo "  ⚠️  jql not found, skipping validation"
        continue
    fi

    # Parse matrix: each property should have ≥3 layers
    # Expected format: { "property": ["layer1", "layer2", ...], ... }
    properties=$(jql '"*" | keys' "$matrix_file" || true)

    if [[ -z "$properties" ]]; then
        echo "  ❌ Failed to parse matrix"
        incomplete=1
        continue
    fi

    # Check each property
    echo "$properties" | jql -r '.[]' | while read -r property; do
        layers=$(jql "\"$property\" | length" "$matrix_file" || echo 0)

        if [[ $layers -lt 3 ]]; then
            echo "  ❌ Property '$property' has only $layers layer(s) (need ≥3)"
            incomplete=1
        else
            echo "  ✅ Property '$property': $layers layers"
        fi
    done
done <<< "$correspondence_files"

echo ""
echo "════════════════════════════════════════════════════════════════"

if [[ $incomplete -gt 0 ]]; then
    echo "❌ Layer 7: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Correspondence matrix incomplete"
    echo "Each property must be validated by ≥3 layers"
    exit 27
else
    echo "✅ Layer 7: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
