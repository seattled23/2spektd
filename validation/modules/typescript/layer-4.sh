#!/bin/bash
# Layer 4: Security Audit
# Purpose: npm audit for vulnerabilities
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

# Check if package.json exists in component or root
package_json=""
if [[ -f "$COMPONENT/package.json" ]]; then
    package_json="$COMPONENT/package.json"
    cd "$COMPONENT"
elif [[ -f "package.json" ]]; then
    package_json="package.json"
else
    echo "⚠️  No package.json found, skipping security audit"
    exit 0
fi

echo "Found: $package_json"
echo ""

# Run npm audit (production only, high/critical only)
echo "Running: npm audit --production --audit-level=high"
echo ""

if npm audit --production --audit-level=high; then
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "✅ Layer 4: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
else
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "❌ Layer 4: FAIL"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Security vulnerabilities detected"
    echo ""
    echo "Fix by:"
    echo "  npm audit fix"
    echo "  npm audit fix --force  (if safe)"
    echo ""
    echo "Review vulnerabilities:"
    echo "  npm audit"
    exit 24
fi
