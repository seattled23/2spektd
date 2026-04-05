#!/bin/bash
# Install validation tools for Python
# Purpose: One-command setup for all required tools

set -e

echo "Installing Python validation tools..."
echo ""

tools=(
    "pyright"
    "pytest"
    "pytest-cov"
    "bandit"
    "safety"
    "deal"
    "radon"
)

for tool in "${tools[@]}"; do
    echo "Installing $tool..."
    if pip install "$tool"; then
        echo "✅ Installed $tool"
    else
        echo "❌ Failed to install $tool"
        exit 1
    fi
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "✅ All Python validation tools installed"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Installed tools:"
echo "  - pyright (type checker)"
echo "  - pytest + pytest-cov (testing)"
echo "  - bandit (security scanner)"
echo "  - safety (vulnerability scanner)"
echo "  - deal (contract framework)"
echo "  - radon (complexity analyzer)"
echo ""
echo "Verify installation:"
echo "  pyright --version"
echo "  pytest --version"
echo "  bandit --version"
echo "  safety --version"
echo "  python -c 'import deal; print(deal.__version__)'"
echo "  radon --version"
echo ""

exit 0
