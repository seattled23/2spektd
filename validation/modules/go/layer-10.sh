#!/bin/bash
# Layer 10: Determinism (Go)
# Purpose: Running validation twice produces identical results
# Exit 0 = PASS, 30 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 10: Determinism Verification"
echo "Component: $COMPONENT"
echo ""

# Run layer 2 (tests) twice, compare outputs
echo "[1/2] Running test suite (run 1)..."
run1_output=$(mktemp)
go test -race -count=1 ./"$COMPONENT"/... 2>&1 | tee "$run1_output"
run1_pass=$(grep -c '^PASS' "$run1_output" || echo 0)
run1_fail=$(grep -c '^FAIL' "$run1_output" || echo 0)

echo ""
echo "[2/2] Running test suite (run 2)..."
run2_output=$(mktemp)
go test -race -count=1 ./"$COMPONENT"/... 2>&1 | tee "$run2_output"
run2_pass=$(grep -c '^PASS' "$run2_output" || echo 0)
run2_fail=$(grep -c '^FAIL' "$run2_output" || echo 0)

echo ""
echo "Comparing results..."
echo "Run 1: $run1_pass PASS, $run1_fail FAIL"
echo "Run 2: $run2_pass PASS, $run2_fail FAIL"

rm -f "$run1_output" "$run2_output"

if [[ $run1_pass -ne $run2_pass || $run1_fail -ne $run2_fail ]]; then
    echo "❌ Test results differ between runs (non-deterministic)"
    echo "   Possible causes: time-based logic, random data, race conditions"
    exit 30
fi

echo "✅ Test results identical (deterministic)"
echo ""
echo "=== Layer 10: PASS ==="
exit 0
