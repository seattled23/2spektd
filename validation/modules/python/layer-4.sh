#!/bin/bash
# Layer 4: Security Audit
# Purpose: bandit + safety for vulnerabilities
# Exit: 24 on vulnerabilities, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 24
fi

echo "Layer 4: Security Audit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

if [[ ! -d "$COMPONENT" ]]; then
    echo "❌ Component not found: $COMPONENT"
    exit 24
fi

echo "Component: $COMPONENT"
echo ""

failed=0

# Part 1: bandit (security linter)
echo "[1/2] Running bandit (security linter)..."
echo ""

# -r: recursive, -ll: only medium/high severity
if bandit -r "$COMPONENT" -ll --format screen 2>&1; then
    echo "✅ Bandit: No security issues"
else
    echo "❌ Bandit: Security issues detected"
    failed=1
fi
echo ""

# Part 2: safety (dependency vulnerabilities)
echo "[2/2] Running safety (dependency scanner)..."
echo ""

# Check if requirements.txt exists
requirements=""
if [[ -f "$COMPONENT/requirements.txt" ]]; then
    requirements="$COMPONENT/requirements.txt"
elif [[ -f "requirements.txt" ]]; then
    requirements="requirements.txt"
fi

if [[ -n "$requirements" ]]; then
    echo "Found: $requirements"

    if safety check --file "$requirements" --json 2>&1; then
        echo "✅ Safety: No vulnerabilities"
    else
        echo "❌ Safety: Vulnerabilities detected"
        failed=1
    fi
else
    echo "⚠️  No requirements.txt found, skipping safety check"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"

if [[ $failed -gt 0 ]]; then
    echo "❌ Layer 4: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Security vulnerabilities detected"
    exit 24
else
    echo "✅ Layer 4: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
