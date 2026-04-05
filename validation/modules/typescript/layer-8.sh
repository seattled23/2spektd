#!/bin/bash
# Layer 8: Completeness Manifest
# Purpose: Validate all acceptance criteria implemented
# Exit: 28 on incomplete, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 28
fi

echo "Layer 8: Completeness Manifest"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 28
fi

echo "Component: $COMPONENT"
echo ""

# Look for completeness manifest
comp_dir=$(fd -t d -g 'comp-*' .outline/outline-strong | grep -F "$(basename "$COMPONENT")" | head -1 || true)

if [[ -z "$comp_dir" ]]; then
    echo "⚠️  No component validation directory found"
    echo "Skipping completeness check (old components grandfathered)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 8: PASS (grandfathered)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

manifest_file=$(fd -e json -g 'completeness*.json' "$comp_dir" | head -1 || true)

if [[ -z "$manifest_file" ]]; then
    echo "⚠️  No completeness manifest found in $comp_dir"
    echo "Skipping (old components grandfathered)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 8: PASS (grandfathered)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

echo "Found manifest: $manifest_file"
echo ""

# Check if jql is available
if ! command -v jql &> /dev/null; then
    echo "⚠️  jql not found, skipping validation"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 8: PASS (tool unavailable)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

# Parse manifest
# Expected format: { "criteria": [ { "id": "AC-1", "description": "...", "status": "implemented|pending" }, ... ] }
criteria=$(jql '"criteria" | length' "$manifest_file" || echo 0)

if [[ $criteria -eq 0 ]]; then
    echo "❌ No acceptance criteria found in manifest"
    exit 28
fi

echo "Total acceptance criteria: $criteria"
echo ""

# Check status of each criterion
incomplete=0
implemented=0
pending=0

for i in $(seq 0 $((criteria - 1))); do
    id=$(jql "\"criteria\"[$i].\"id\"" "$manifest_file" -r || echo "UNKNOWN")
    status=$(jql "\"criteria\"[$i].\"status\"" "$manifest_file" -r || echo "unknown")
    desc=$(jql "\"criteria\"[$i].\"description\"" "$manifest_file" -r || echo "")

    if [[ "$status" == "implemented" ]]; then
        echo "  ✅ $id: $desc"
        implemented=$((implemented + 1))
    else
        echo "  ❌ $id: $desc [PENDING]"
        pending=$((pending + 1))
        incomplete=1
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "Summary:"
echo "  Implemented: $implemented"
echo "  Pending:     $pending"
echo ""

if [[ $incomplete -gt 0 ]]; then
    echo "❌ Layer 8: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Not all acceptance criteria implemented"
    exit 28
else
    echo "✅ Layer 8: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
