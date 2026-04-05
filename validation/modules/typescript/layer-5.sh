#!/bin/bash
# Layer 5: Architecture Scores
# Purpose: 6-dimension architecture analysis (≥80 composite, all ≥50)
# Exit: 25 on low scores, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 25
fi

echo "Layer 5: Architecture Scores"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 25
fi

echo "Component: $COMPONENT"
echo ""

# Dimension 1: Coupling (import count per file)
echo "[1/6] Coupling (import count)..."
ts_files=$(fd -e ts -e tsx --exclude '*.test.ts' --exclude '*.test.tsx' . "$COMPONENT" | wc -l || echo 0)

if [[ $ts_files -eq 0 ]]; then
    echo "⚠️  No TypeScript files found, skipping architecture scoring"
    exit 0
fi

total_imports=$(rg '^import ' "$COMPONENT" | wc -l || echo 0)
avg_imports=$(echo "scale=2; $total_imports / $ts_files" | bc)

# Score: 100 - (avg_imports * 5), min 0
coupling_score=$(echo "scale=2; 100 - ($avg_imports * 5)" | bc)
if (( $(echo "$coupling_score < 0" | bc -l) )); then
    coupling_score=0
fi

echo "  Files: $ts_files"
echo "  Total imports: $total_imports"
echo "  Avg imports/file: $avg_imports"
echo "  Score: $coupling_score"
echo ""

# Dimension 2: Cohesion (functions per file)
echo "[2/6] Cohesion (functions per file)..."
total_funcs=$(rg '^(export )?(async )?function ' "$COMPONENT" --exclude '*.test.ts' --exclude '*.test.tsx' | wc -l || echo 0)
avg_funcs=$(echo "scale=2; $total_funcs / $ts_files" | bc)

# Score: Ideal 5-10 functions per file
# 100 if 5-10, penalize if too high/low
if (( $(echo "$avg_funcs >= 5 && $avg_funcs <= 10" | bc -l) )); then
    cohesion_score=100
elif (( $(echo "$avg_funcs < 5" | bc -l) )); then
    cohesion_score=$(echo "scale=2; $avg_funcs * 20" | bc)
else
    cohesion_score=$(echo "scale=2; 100 - (($avg_funcs - 10) * 10)" | bc)
    if (( $(echo "$cohesion_score < 0" | bc -l) )); then
        cohesion_score=0
    fi
fi

echo "  Total functions: $total_funcs"
echo "  Avg functions/file: $avg_funcs"
echo "  Score: $cohesion_score"
echo ""

# Dimension 3: Complexity (cyclomatic complexity via complexity-report)
echo "[3/6] Complexity (cyclomatic)..."

if command -v cr &> /dev/null; then
    complexity_output=$(mktemp)

    # Run complexity-report on all TS files
    fd -e ts -e tsx --exclude '*.test.ts' --exclude '*.test.tsx' . "$COMPONENT" | while read -r file; do
        cr "$file" --format json >> "$complexity_output" 2>/dev/null || true
    done

    # Parse average complexity (simplified - just check for high complexity functions)
    high_complexity=$(rg -i 'complexity.*([2-9][0-9]|[1-9][0-9]{2,})' "$complexity_output" | wc -l || echo 0)

    rm -f "$complexity_output"

    # Score: penalize high complexity functions
    complexity_score=$(echo "scale=2; 100 - ($high_complexity * 10)" | bc)
    if (( $(echo "$complexity_score < 0" | bc -l) )); then
        complexity_score=0
    fi

    echo "  High complexity functions: $high_complexity"
    echo "  Score: $complexity_score"
else
    echo "  ⚠️  complexity-report not found, using default score 75"
    complexity_score=75
fi
echo ""

# Dimension 4: Error Handling (try/catch coverage)
echo "[4/6] Error Handling (try/catch usage)..."
async_funcs=$(rg '^(export )?async function ' "$COMPONENT" --exclude '*.test.ts' | wc -l || echo 0)
try_blocks=$(rg 'try \{' "$COMPONENT" --exclude '*.test.ts' | wc -l || echo 0)

if [[ $async_funcs -eq 0 ]]; then
    error_score=100
else
    coverage_ratio=$(echo "scale=2; $try_blocks / $async_funcs" | bc)
    error_score=$(echo "scale=2; $coverage_ratio * 100" | bc)
    if (( $(echo "$error_score > 100" | bc -l) )); then
        error_score=100
    fi
fi

echo "  Async functions: $async_funcs"
echo "  Try blocks: $try_blocks"
echo "  Score: $error_score"
echo ""

# Dimension 5: Type Safety ('any' usage)
echo "[5/6] Type Safety (any usage)..."
any_count=$(rg ': any' "$COMPONENT" --exclude '*.test.ts' | wc -l || echo 0)

# Score: penalize 'any' usage
type_score=$(echo "scale=2; 100 - ($any_count * 5)" | bc)
if (( $(echo "$type_score < 0" | bc -l) )); then
    type_score=0
fi

echo "  'any' usages: $any_count"
echo "  Score: $type_score"
echo ""

# Dimension 6: Module Design (circular dependencies - simplified check)
echo "[6/6] Module Design (circular imports)..."
# This is a simplified check - real circular dependency detection requires graph analysis
# For now, just check for imports from parent directories
parent_imports=$(rg 'from ["\x27]\.\./\.\.' "$COMPONENT" | wc -l || echo 0)

module_score=$(echo "scale=2; 100 - ($parent_imports * 10)" | bc)
if (( $(echo "$module_score < 0" | bc -l) )); then
    module_score=0
fi

echo "  Parent directory imports: $parent_imports"
echo "  Score: $module_score"
echo ""

# Calculate composite score
composite=$(echo "scale=2; ($coupling_score + $cohesion_score + $complexity_score + $error_score + $type_score + $module_score) / 6" | bc)

echo "════════════════════════════════════════════════════════════════"
echo "Architecture Scores:"
echo "  1. Coupling:     $coupling_score"
echo "  2. Cohesion:     $cohesion_score"
echo "  3. Complexity:   $complexity_score"
echo "  4. Error Handling: $error_score"
echo "  5. Type Safety:  $type_score"
echo "  6. Module Design: $module_score"
echo ""
echo "  Composite:       $composite"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check thresholds
threshold=80
min_dimension=50

failed=0

if (( $(echo "$composite < $threshold" | bc -l) )); then
    echo "❌ Composite score below threshold (need ≥$threshold)"
    failed=1
fi

for score in "$coupling_score" "$cohesion_score" "$complexity_score" "$error_score" "$type_score" "$module_score"; do
    if (( $(echo "$score < $min_dimension" | bc -l) )); then
        echo "❌ Dimension below minimum (need ≥$min_dimension)"
        failed=1
        break
    fi
done

if [[ $failed -eq 1 ]]; then
    echo ""
    echo "❌ Layer 5: FAIL"
    exit 25
else
    echo "✅ Layer 5: PASS"
    exit 0
fi
