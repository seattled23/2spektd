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

# Count Python files (exclude tests, __init__.py)
py_files=$(fd -e py --exclude '*_test.py' --exclude 'test_*.py' --exclude '__init__.py' . "$COMPONENT" | wc -l || echo 0)

if [[ $py_files -eq 0 ]]; then
    echo "⚠️  No Python files found, skipping architecture scoring"
    exit 0
fi

# Dimension 1: Coupling (import count per file)
echo "[1/6] Coupling (import count)..."
total_imports=$(rg '^(import |from .* import)' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)
avg_imports=$(echo "scale=2; $total_imports / $py_files" | bc)

coupling_score=$(echo "scale=2; 100 - ($avg_imports * 5)" | bc)
if (( $(echo "$coupling_score < 0" | bc -l) )); then
    coupling_score=0
fi

echo "  Files: $py_files"
echo "  Total imports: $total_imports"
echo "  Avg imports/file: $avg_imports"
echo "  Score: $coupling_score"
echo ""

# Dimension 2: Cohesion (functions per file)
echo "[2/6] Cohesion (functions per file)..."
total_funcs=$(rg '^def [a-z]' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)
avg_funcs=$(echo "scale=2; $total_funcs / $py_files" | bc)

# Ideal: 5-10 functions per file
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

# Dimension 3: Complexity (radon cc)
echo "[3/6] Complexity (cyclomatic)..."

if command -v radon &> /dev/null; then
    # Get average complexity
    complexity_output=$(radon cc "$COMPONENT" -a -s || true)

    # Parse average complexity from radon output
    avg_complexity=$(echo "$complexity_output" | grep -i 'average complexity' | awk '{print $NF}' | sed 's/[()]//g' || echo "5")

    if [[ -z "$avg_complexity" ]]; then
        avg_complexity=5
    fi

    # Score: penalize complexity >10
    if (( $(echo "$avg_complexity <= 10" | bc -l) )); then
        complexity_score=100
    else
        complexity_score=$(echo "scale=2; 100 - (($avg_complexity - 10) * 10)" | bc)
        if (( $(echo "$complexity_score < 0" | bc -l) )); then
            complexity_score=0
        fi
    fi

    echo "  Average complexity: $avg_complexity"
    echo "  Score: $complexity_score"
else
    echo "  ⚠️  radon not found, using default score 75"
    complexity_score=75
fi
echo ""

# Dimension 4: Error Handling (try/except coverage)
echo "[4/6] Error Handling (exception handling)..."
func_count=$(rg '^def [a-z]' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)
try_count=$(rg '^\s+try:' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)

if [[ $func_count -eq 0 ]]; then
    error_score=100
else
    coverage_ratio=$(echo "scale=2; ($try_count / $func_count) * 100" | bc)
    error_score=$coverage_ratio
    if (( $(echo "$error_score > 100" | bc -l) )); then
        error_score=100
    fi
fi

echo "  Functions: $func_count"
echo "  Try blocks: $try_count"
echo "  Score: $error_score"
echo ""

# Dimension 5: Type Hints (annotation coverage)
echo "[5/6] Type Hints (annotation coverage)..."
# Count function signatures with type hints
typed_funcs=$(rg '^def [a-z][^(]*\([^)]*:[^)]+\)' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)
total_def=$(rg '^def [a-z]' "$COMPONENT" --exclude '*_test.py' --exclude 'test_*.py' | wc -l || echo 0)

if [[ $total_def -eq 0 ]]; then
    type_score=100
else
    type_coverage=$(echo "scale=2; ($typed_funcs / $total_def) * 100" | bc)
    type_score=$type_coverage
fi

echo "  Typed functions: $typed_funcs / $total_def"
echo "  Score: $type_score"
echo ""

# Dimension 6: Module Design (circular imports - simplified)
echo "[6/6] Module Design (import patterns)..."
# Check for relative imports from parent (anti-pattern)
parent_imports=$(rg 'from \.\.\. import' "$COMPONENT" | wc -l || echo 0)

module_score=$(echo "scale=2; 100 - ($parent_imports * 10)" | bc)
if (( $(echo "$module_score < 0" | bc -l) )); then
    module_score=0
fi

echo "  Parent imports: $parent_imports"
echo "  Score: $module_score"
echo ""

# Calculate composite score
composite=$(echo "scale=2; ($coupling_score + $cohesion_score + $complexity_score + $error_score + $type_score + $module_score) / 6" | bc)

echo "════════════════════════════════════════════════════════════════"
echo "Architecture Scores:"
echo "  1. Coupling:       $coupling_score"
echo "  2. Cohesion:       $cohesion_score"
echo "  3. Complexity:     $complexity_score"
echo "  4. Error Handling: $error_score"
echo "  5. Type Hints:     $type_score"
echo "  6. Module Design:  $module_score"
echo ""
echo "  Composite:         $composite"
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
