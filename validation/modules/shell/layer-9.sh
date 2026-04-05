#!/bin/bash
# Layer 9: Artifact Chain
# Purpose: Validate validation report exists and is complete
# Exit: 29 on incomplete, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 29
fi

echo "Layer 9: Artifact Chain"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 29
fi

echo "Component: $COMPONENT"
echo ""

# Look for validation report
comp_dir=$(fd -t d -g 'comp-*' .outline/outline-strong | grep -F "$(basename "$COMPONENT")" | head -1 || true)

if [[ -z "$comp_dir" ]]; then
    echo "⚠️  No component validation directory found"
    echo "Skipping artifact chain check (old components grandfathered)"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 9: PASS (grandfathered)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

report_file=$(fd -e md -g 'validation-report*.md' "$comp_dir" | head -1 || true)

if [[ -z "$report_file" ]]; then
    echo "❌ No validation report found in $comp_dir"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ Layer 9: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Generate validation report with all layer results"
    exit 29
fi

echo "Found report: $report_file"
echo ""

# Check report completeness
# Required sections: Component, Validation Date, Layer Results, Summary
required_sections=(
    "# Validation Report"
    "## Component"
    "## Validation Date"
    "## Layer Results"
    "## Summary"
)

missing=0

for section in "${required_sections[@]}"; do
    if grep -q "$section" "$report_file"; then
        echo "  ✅ $section"
    else
        echo "  ❌ $section (missing)"
        missing=$((missing + 1))
    fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"

if [[ $missing -gt 0 ]]; then
    echo "❌ Layer 9: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Validation report incomplete"
    echo "Missing $missing required section(s)"
    exit 29
else
    echo "✅ Layer 9: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
