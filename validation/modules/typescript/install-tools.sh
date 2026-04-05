#!/bin/bash
# Install validation tools for TypeScript
# Purpose: One-command setup for all required tools

set -e

echo "Installing TypeScript validation tools..."
echo ""

tools=(
    "typescript"
    "eslint"
    "vitest"
    "@vitest/coverage-v8"
    "complexity-report"
)

for tool in "${tools[@]}"; do
    echo "Installing $tool..."
    if bun install -g "$tool"; then
        echo "✅ Installed $tool"
    else
        echo "❌ Failed to install $tool"
        exit 1
    fi
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "✅ All TypeScript validation tools installed"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Installed tools:"
echo "  - typescript (type checker)"
echo "  - eslint (linter)"
echo "  - vitest (test runner)"
echo "  - @vitest/coverage-v8 (coverage)"
echo "  - complexity-report (architecture)"
echo ""
echo "Verify installation:"
echo "  tsc --version"
echo "  eslint --version"
echo "  vitest --version"
echo "  cr --version"
echo ""

exit 0
