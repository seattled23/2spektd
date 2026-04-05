#!/bin/bash
# Layer 9: Artifact Chain (Go)
# Purpose: Validation report exists and is complete
# Exit 0 = PASS, 29 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 9: Artifact Chain Validation"
echo "Component: $COMPONENT"
echo ""

# Look for validation report
comp_name=$(basename "$COMPONENT")
report_file=".outline/outline-strong/${comp_name}/validation-report.md"

if [[ ! -f "$report_file" ]]; then
    echo "⚠️  Validation report not found: $report_file"
    echo "   This is expected for new components (will be generated after all layers pass)"
    echo ""
    echo "=== Layer 9: SKIP (no report yet) ==="
    exit 0
fi

echo "Checking report: $report_file"

# Required sections
required_sections=(
    "## Layer Results"
    "## L5: Architecture Score Breakdown"
    "## L7: Correspondence Matrix"
    "## Key Verification"
)

missing_sections=0
for section in "${required_sections[@]}"; do
    if ! grep -q "$section" "$report_file"; then
        echo "❌ Missing section: $section"
        missing_sections=$((missing_sections + 1))
    else
        echo "✅ Found section: $section"
    fi
done

if [[ $missing_sections -gt 0 ]]; then
    echo ""
    echo "❌ Report incomplete ($missing_sections missing sections)"
    exit 29
fi

echo ""
echo "✅ Validation report complete"
echo ""
echo "=== Layer 9: PASS ==="
exit 0
