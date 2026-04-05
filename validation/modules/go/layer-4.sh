#!/bin/bash
# Layer 4: Security Audit (Go)
# Purpose: gosec + govulncheck — no critical/high vulnerabilities
# Exit 0 = PASS, 24 = FAIL

set -e

COMPONENT=$1
if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

echo "Layer 4: Security Audit"
echo "Component: $COMPONENT"
echo ""

# Step 1: gosec (security scanner)
echo "[1/2] Running gosec..."
gosec_output=$(mktemp)
if ! gosec -severity high -confidence medium -quiet ./"$COMPONENT"/... 2>&1 | tee "$gosec_output"; then
    # gosec exit non-zero if issues found
    critical_count=$(grep -c '\[HIGH\]' "$gosec_output" || true)
    if [[ $critical_count -gt 0 ]]; then
        echo ""
        echo "❌ gosec found $critical_count high-severity issues"
        rm -f "$gosec_output"
        exit 24
    fi
fi
rm -f "$gosec_output"
echo "✅ gosec passed"
echo ""

# Step 2: govulncheck (vulnerability scanner)
echo "[2/2] Running govulncheck..."
if ! govulncheck ./"$COMPONENT"/...; then
    echo "❌ govulncheck found vulnerabilities"
    exit 24
fi
echo "✅ govulncheck passed"
echo ""

echo "=== Layer 4: PASS ==="
exit 0
