#!/bin/bash
# Layer 6: Convergence (Go)
# Purpose: Verify layer 5 scores are deterministic (Δ < 2%)
# Exit 0 = PASS, 26 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 6: Convergence (Determinism Check)"
echo "Component: $COMPONENT"
echo ""

# Run layer 5 twice, capture scores
echo "[1/3] Running layer 5 (run 1)..."
score1_output=$(mktemp)
bash .outline/outline-strong/modules/go/layer-5.sh "$COMPONENT" | tee "$score1_output"
score1=$(grep 'Composite Score:' "$score1_output" | awk '{print $3}')

echo ""
echo "[2/3] Running layer 5 (run 2)..."
score2_output=$(mktemp)
bash .outline/outline-strong/modules/go/layer-5.sh "$COMPONENT" | tee "$score2_output"
score2=$(grep 'Composite Score:' "$score2_output" | awk '{print $3}')

echo ""
echo "[3/3] Comparing scores..."
echo "Run 1: $score1"
echo "Run 2: $score2"

# Calculate delta percentage
delta=$(echo "scale=4; ($score1 - $score2) / $score1 * 100" | bc | tr -d '-')
echo "Delta: ${delta}%"

# Threshold: < 2%
threshold=2.0
if (( $(echo "$delta >= $threshold" | bc -l) )); then
    echo "❌ Delta exceeds threshold (need <${threshold}%)"
    rm -f "$score1_output" "$score2_output"
    exit 26
fi

rm -f "$score1_output" "$score2_output"

echo "✅ Scores converged (delta <${threshold}%)"
echo ""
echo "=== Layer 6: PASS ==="
exit 0
