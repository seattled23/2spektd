#!/bin/bash
# Layer 6: Convergence
# Purpose: Check architecture score drift from baseline (Δ <2%)
# Exit: 26 on high drift, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 26
fi

echo "Layer 6: Convergence"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 26
fi

echo "Component: $COMPONENT"
echo ""

# Check for baseline architecture scores
baseline_file=".outline/outline-strong/baselines/$(echo "$COMPONENT" | tr '/' '-')-architecture.txt"

if [[ ! -f "$baseline_file" ]]; then
    echo "⚠️  No architecture baseline found: $baseline_file"
    echo "Creating baseline from current run..."
    echo ""

    # Run layer-5 to get current scores
    current_output=$(bash "$(dirname "$0")/layer-5.sh" "$COMPONENT" 2>&1 || true)
    current_composite=$(echo "$current_output" | grep 'Composite:' | awk '{print $2}')

    if [[ -z "$current_composite" ]]; then
        echo "❌ Could not extract composite score"
        exit 26
    fi

    # Save baseline
    mkdir -p ".outline/outline-strong/baselines"
    echo "$current_composite" > "$baseline_file"

    echo "✅ Baseline saved: $current_composite"
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 6: PASS (baseline created)"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi

# Read baseline
baseline=$(cat "$baseline_file")
echo "Baseline composite score: $baseline"

# Get current scores
current_output=$(bash "$(dirname "$0")/layer-5.sh" "$COMPONENT" 2>&1 || true)
current_composite=$(echo "$current_output" | grep 'Composite:' | awk '{print $2}')

if [[ -z "$current_composite" ]]; then
    echo "❌ Could not extract current composite score"
    exit 26
fi

echo "Current composite score:  $current_composite"
echo ""

# Calculate drift percentage
drift=$(echo "scale=4; (($current_composite - $baseline) / $baseline) * 100" | bc)
drift_abs=$(echo "$drift" | tr -d '-')

echo "Drift: ${drift}%"
echo ""

threshold=2.0

if (( $(echo "$drift_abs > $threshold" | bc -l) )); then
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ Layer 6: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Architecture drift exceeds threshold"
    echo "  Threshold: ±${threshold}%"
    echo "  Actual:    ${drift}%"
    echo ""
    echo "If this drift is intentional, update baseline:"
    echo "  echo \"$current_composite\" > $baseline_file"
    exit 26
else
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 6: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
