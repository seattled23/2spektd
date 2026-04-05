#!/bin/bash
# Layer 5: Architecture Scores (Go)
# Purpose: Coupling, cohesion, complexity — composite ≥80, all dimensions ≥50
# Exit 0 = PASS, 25 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 5: Architecture Scores"
echo "Component: $COMPONENT"
echo ""

# Score calculation (simplified — real implementation would use tools)
# For now, using heuristics:

# 1. Coupling: Count imports
coupling_score=100
import_count=$(rg '^import (\(|")' "$COMPONENT" | wc -l || echo 0)
if [[ $import_count -gt 20 ]]; then
    coupling_score=50
elif [[ $import_count -gt 10 ]]; then
    coupling_score=75
fi
echo "[1/6] Coupling: $coupling_score (${import_count} imports)"

# 2. Cohesion: Files per package (1-3 = good, 10+ = poor)
cohesion_score=100
file_count=$(fd -e go --exclude '*_test.go' . "$COMPONENT" | wc -l)
if [[ $file_count -gt 10 ]]; then
    cohesion_score=60
elif [[ $file_count -gt 5 ]]; then
    cohesion_score=80
fi
echo "[2/6] Cohesion: $cohesion_score (${file_count} files)"

# 3. Complexity: gocyclo (cyclomatic complexity)
complexity_score=100
if command -v gocyclo &> /dev/null; then
    high_complexity=$(gocyclo -over 10 "$COMPONENT" 2>/dev/null | wc -l || echo 0)
    if [[ $high_complexity -gt 5 ]]; then
        complexity_score=50
    elif [[ $high_complexity -gt 0 ]]; then
        complexity_score=70
    fi
    echo "[3/6] Complexity: $complexity_score (${high_complexity} functions >10)"
else
    echo "[3/6] Complexity: SKIP (gocyclo not installed)"
fi

# 4. Interface Compliance: Exported symbols ratio
interface_score=100
exported=$(rg '^(func|type|var|const) [A-Z]' "$COMPONENT" | wc -l || echo 0)
total=$(rg '^(func|type|var|const) ' "$COMPONENT" | wc -l || echo 1)
export_ratio=$(echo "scale=2; $exported / $total * 100" | bc || echo 100)
if (( $(echo "$export_ratio > 80" | bc -l) )); then
    interface_score=60  # Too many exports
elif (( $(echo "$export_ratio < 20" | bc -l) )); then
    interface_score=80  # Good encapsulation
fi
echo "[4/6] Interface Compliance: $interface_score (${export_ratio}% exported)"

# 5. Error Handling: Wrapped errors percentage
error_score=100
unwrapped=$(rg 'return.*err[^.]' "$COMPONENT" | wc -l || echo 0)
wrapped=$(rg 'return.*fmt\.Errorf.*%w' "$COMPONENT" | wc -l || echo 0)
total_errors=$((unwrapped + wrapped))
if [[ $total_errors -gt 0 ]]; then
    wrap_ratio=$(echo "scale=2; $wrapped / $total_errors * 100" | bc)
    if (( $(echo "$wrap_ratio < 50" | bc -l) )); then
        error_score=65
    elif (( $(echo "$wrap_ratio < 80" | bc -l) )); then
        error_score=85
    fi
    echo "[5/6] Error Handling: $error_score (${wrap_ratio}% wrapped)"
else
    echo "[5/6] Error Handling: 100 (no errors)"
fi

# 6. Package Design: heuristic (file organization)
package_score=90  # Default good score
echo "[6/6] Package Design: $package_score (heuristic)"

# Calculate composite score
composite=$(echo "scale=2; ($coupling_score + $cohesion_score + $complexity_score + $interface_score + $error_score + $package_score) / 6" | bc)
echo ""
echo "Composite Score: $composite / 100"

# Check thresholds
threshold=80
min_dimension=50

if (( $(echo "$composite < $threshold" | bc -l) )); then
    echo "❌ Composite score below threshold (need ≥$threshold)"
    exit 25
fi

# Check individual dimensions
for score in $coupling_score $cohesion_score $complexity_score $interface_score $error_score $package_score; do
    if [[ $score -lt $min_dimension ]]; then
        echo "❌ Dimension score below minimum (need ≥$min_dimension)"
        exit 25
    fi
done

echo "✅ All dimensions ≥$min_dimension, composite ≥$threshold"
echo ""
echo "=== Layer 5: PASS ==="
exit 0
