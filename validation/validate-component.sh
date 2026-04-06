#!/bin/bash
# Master Validation Orchestrator — Outline-Strong v2.0
# Purpose: Run all validation layers for a component
# Usage: ./validate-component.sh <component-path> <language>

set -e

COMPONENT=$1
LANGUAGE=$2

if [[ -z "$COMPONENT" || -z "$LANGUAGE" ]]; then
    echo "Usage: $0 <component-path> <language>"
    echo ""
    echo "Examples:"
    echo "  $0 pkg/fhir go"
    echo "  $0 website/src/components typescript"
    echo "  $0 scripts/deploy python"
    echo ""
    echo "Available languages: go, typescript, python, shell"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Try validation/modules first (standalone 2spektd), then .outline (integration mode)
if [[ -d "validation/modules/$LANGUAGE" ]]; then
    MODULE_DIR="validation/modules/$LANGUAGE"
elif [[ -d ".outline/outline-strong/modules/$LANGUAGE" ]]; then
    MODULE_DIR=".outline/outline-strong/modules/$LANGUAGE"
else
    echo "❌ Language module not found: $LANGUAGE"
    echo "   Searched: validation/modules/$LANGUAGE"
    echo "            .outline/outline-strong/modules/$LANGUAGE"
    exit 1
fi

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     OUTLINE-STRONG v2.0 — Validation Orchestrator             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Component: $COMPONENT"
echo "Language:  $LANGUAGE"
echo "Module:    $MODULE_DIR"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Layer order
layers=( "-n1" "-0" "-1" "-2" "-3" "-4" "-5" "-6" "-7" "-8" "-9" "-10" )
layer_names=(
    "Self-Validation"
    "Static Analysis"
    "Contract Annotations"
    "Test Suite"
    "Anti-Hollow Patterns"
    "Security Audit"
    "Architecture Scores"
    "Convergence"
    "Correspondence Matrix"
    "Completeness Manifest"
    "Artifact Chain"
    "Determinism"
)

passed=0
failed=0
skipped=0

for i in "${!layers[@]}"; do
    layer="${layers[$i]}"
    layer_name="${layer_names[$i]}"
    script="$MODULE_DIR/layer${layer}.sh"

    echo "┌────────────────────────────────────────────────────────────┐"
    echo "│ Layer $layer: $layer_name"
    echo "└────────────────────────────────────────────────────────────┘"
    echo ""

    if [[ ! -f "$script" ]]; then
        echo "⚠️  Script not found: $script (SKIPPED)"
        skipped=$((skipped + 1))
        echo ""
        continue
    fi

    if bash "$script" "$COMPONENT"; then
        passed=$((passed + 1))
    else
        exit_code=$?
        echo ""
        echo "════════════════════════════════════════════════════════════════"
        echo "❌ VALIDATION FAILED at Layer $layer: $layer_name"
        echo "════════════════════════════════════════════════════════════════"
        echo ""
        echo "Exit code: $exit_code"
        echo "Component: $COMPONENT"
        echo "Language:  $LANGUAGE"
        echo ""
        echo "Fix the issues above and re-run:"
        echo "  $0 $COMPONENT $LANGUAGE"
        echo ""
        exit "$exit_code"
    fi

    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "✅ ALL LAYERS PASSED"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Summary:"
echo "  Passed:  $passed"
echo "  Failed:  $failed"
echo "  Skipped: $skipped"
echo ""
echo "Component: $COMPONENT"
echo "Language:  $LANGUAGE"
echo ""
echo "Next steps:"
echo "  - Generate validation report (layer 9)"
echo "  - Commit changes"
echo "  - Move to next component"
echo ""

exit 0
