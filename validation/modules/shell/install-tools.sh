#!/bin/bash
# Install validation tools for Shell
# Purpose: One-command setup for all required tools

set -e

echo "Installing Shell validation tools..."
echo ""

# Check OS for platform-specific installs
if command -v apt &> /dev/null; then
    echo "Detected: Debian/Ubuntu (apt)"
    echo "Installing shellcheck..."
    sudo apt install -y shellcheck
elif command -v brew &> /dev/null; then
    echo "Detected: macOS (brew)"
    echo "Installing shellcheck..."
    brew install shellcheck
else
    echo "⚠️  Could not detect package manager (apt/brew)"
    echo "Please install shellcheck manually:"
    echo "  https://github.com/koalaman/shellcheck#installing"
fi

echo ""
echo "Installing shfmt (via go)..."
if go install mvdan.cc/sh/v3/cmd/shfmt@latest; then
    echo "✅ Installed shfmt"
else
    echo "❌ Failed to install shfmt"
    exit 1
fi

echo ""
echo "Installing bats (via bun)..."
if bun install -g bats; then
    echo "✅ Installed bats"
else
    echo "⚠️  Failed to install bats via bun, trying npm..."
    if npm install -g bats; then
        echo "✅ Installed bats"
    else
        echo "❌ Failed to install bats"
        exit 1
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ All Shell validation tools installed"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Installed tools:"
echo "  - shellcheck (linter)"
echo "  - shfmt (formatter)"
echo "  - bats (test framework)"
echo ""
echo "Verify installation:"
echo "  shellcheck --version"
echo "  shfmt --version"
echo "  bats --version"
echo ""

exit 0
