#!/bin/bash
# Layer 5: Architecture Scores (Simplified for Shell)
# Purpose: Basic code quality metrics
# Exit: 25 on low scores, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 25
fi

echo "Layer 5: Architecture Scores (Simplified)"
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

# Count shell scripts (exclude tests)
sh_files=$(fd -e sh --exclude 'test_*.sh' . "$COMPONENT" | wc -l || echo 0)

if [[ $sh_files -eq 0 ]]; then
    echo "⚠️  No shell scripts found, skipping architecture scoring"
    exit 0
fi

# Metric 1: Functions per file
echo "[1/3] Functions per file..."
total_funcs=$(rg '^(function [a-z_]|[a-z_][a-z0-9_]*\(\))' "$COMPONENT" --exclude 'test_*.sh' | wc -l || echo 0)
avg_funcs=$(echo "scale=2; $total_funcs / $sh_files" | bc)

echo "  Files: $sh_files"
echo "  Functions: $total_funcs"
echo "  Avg: $avg_funcs per file"

# Ideal: 3-10 functions per file
if (( $(echo "$avg_funcs >= 3 && $avg_funcs <= 10" | bc -l) )); then
    func_score=100
elif (( $(echo "$avg_funcs < 3" | bc -l) )); then
    func_score=$(echo "scale=2; $avg_funcs * 33" | bc)
else
    func_score=$(echo "scale=2; 100 - (($avg_funcs - 10) * 10)" | bc)
    if (( $(echo "$func_score < 0" | bc -l) )); then
        func_score=0
    fi
fi

echo "  Score: $func_score"
echo ""

# Metric 2: Global variables
echo "[2/3] Global variables..."
# Count variables set outside functions
global_vars=$(rg '^[A-Z_][A-Z0-9_]*=' "$COMPONENT" --exclude 'test_*.sh' | wc -l || echo 0)
globals_per_file=$(echo "scale=2; $global_vars / $sh_files" | bc)

echo "  Global vars: $global_vars"
echo "  Avg per file: $globals_per_file"

# Penalize excessive globals
global_score=$(echo "scale=2; 100 - ($globals_per_file * 10)" | bc)
if (( $(echo "$global_score < 0" | bc -l) )); then
    global_score=0
fi

echo "  Score: $global_score"
echo ""

# Metric 3: Sourced dependencies
echo "[3/3] Sourced dependencies..."
# Count source/. commands
sourced=$(rg '^\. |^source ' "$COMPONENT" --exclude 'test_*.sh' | wc -l || echo 0)
sources_per_file=$(echo "scale=2; $sourced / $sh_files" | bc)

echo "  Sourced files: $sourced"
echo "  Avg per file: $sources_per_file"

# Ideal: 1-3 sources per file
if (( $(echo "$sources_per_file >= 1 && $sources_per_file <= 3" | bc -l) )); then
    source_score=100
elif (( $(echo "$sources_per_file < 1" | bc -l) )); then
    source_score=$(echo "scale=2; $sources_per_file * 100" | bc)
else
    source_score=$(echo "scale=2; 100 - (($sources_per_file - 3) * 15)" | bc)
    if (( $(echo "$source_score < 0" | bc -l) )); then
        source_score=0
    fi
fi

echo "  Score: $source_score"
echo ""

# Composite score
composite=$(echo "scale=2; ($func_score + $global_score + $source_score) / 3" | bc)

echo "════════════════════════════════════════════════════════════════"
echo "Architecture Scores:"
echo "  1. Functions:  $func_score"
echo "  2. Globals:    $global_score"
echo "  3. Sources:    $source_score"
echo ""
echo "  Composite:     $composite"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Lower threshold for shell (60 instead of 80)
threshold=60

if (( $(echo "$composite < $threshold" | bc -l) )); then
    echo "❌ Layer 5: FAIL"
    echo ""
    echo "Composite score below threshold (need ≥$threshold)"
    exit 25
else
    echo "✅ Layer 5: PASS"
    exit 0
fi
