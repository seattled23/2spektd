#!/bin/bash
# Layer 7: Correspondence (Go)
# Purpose: Each property verified by ≥3 layers
# Exit 0 = PASS, 27 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 7: Correspondence Matrix"
echo "Component: $COMPONENT"
echo ""

# Look for correspondence matrix JSON
comp_name=$(basename "$COMPONENT")
matrix_file=".outline/outline-strong/correspondence-${comp_name}.json"

if [[ ! -f "$matrix_file" ]]; then
    echo "⚠️  Correspondence matrix not found: $matrix_file"
    echo "   Skipping validation (no properties defined)"
    echo ""
    echo "=== Layer 7: SKIP (no matrix) ==="
    exit 0
fi

echo "Reading matrix: $matrix_file"

# Use jql to check all properties have coverage ≥3
under_covered=$(jql '"properties" | select(.coverage < 3) | length' < "$matrix_file")

if [[ "$under_covered" != "0" ]]; then
    echo "❌ Found $under_covered properties with coverage <3"
    echo ""
    echo "Under-covered properties:"
    jql '"properties" | select(.coverage < 3) | .name' < "$matrix_file"
    exit 27
fi

total_properties=$(jql '"properties" | length' < "$matrix_file")
echo "✅ All $total_properties properties have coverage ≥3"
echo ""
echo "=== Layer 7: PASS ==="
exit 0
