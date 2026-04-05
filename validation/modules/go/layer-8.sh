#!/bin/bash
# Layer 8: Completeness (Go)
# Purpose: All acceptance criteria implemented
# Exit 0 = PASS, 28 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 8: Completeness Manifest"
echo "Component: $COMPONENT"
echo ""

# Look for completeness manifest JSON
comp_name=$(basename "$COMPONENT")
manifest_file=".outline/outline-strong/completeness-${comp_name}.json"

if [[ ! -f "$manifest_file" ]]; then
    echo "⚠️  Completeness manifest not found: $manifest_file"
    echo "   Skipping validation (no acceptance criteria defined)"
    echo ""
    echo "=== Layer 8: SKIP (no manifest) ==="
    exit 0
fi

echo "Reading manifest: $manifest_file"

# Check applied == total
applied=$(jql '"applied"' < "$manifest_file")
total=$(jql '"total"' < "$manifest_file")

echo "Acceptance criteria: $applied / $total applied"

if [[ "$applied" != "$total" ]]; then
    echo "❌ Not all acceptance criteria implemented"
    echo ""
    echo "Missing criteria:"
    jql '"acceptance_criteria" | select(.status != "PASS") | .id + ": " + .description' < "$manifest_file"
    exit 28
fi

echo "✅ All $total acceptance criteria implemented"
echo ""
echo "=== Layer 8: PASS ==="
exit 0
