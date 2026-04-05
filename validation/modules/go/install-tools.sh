#!/bin/bash
# Install validation tools for Go
# Purpose: One-command setup for all required tools

set -e

echo "Installing Go validation tools..."
echo ""

tools=(
    "github.com/golangci/golangci-lint/cmd/golangci-lint@latest"
    "github.com/securego/gosec/v2/cmd/gosec@latest"
    "golang.org/x/vuln/cmd/govulncheck@latest"
    "github.com/fzipp/gocyclo/cmd/gocyclo@latest"
    "honnef.co/go/tools/cmd/staticcheck@latest"
)

for tool in "${tools[@]}"; do
    echo "Installing $tool..."
    if go install "$tool"; then
        echo "✅ Installed $(basename "$tool")"
    else
        echo "❌ Failed to install $tool"
        exit 1
    fi
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "✅ All Go validation tools installed"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Installed tools:"
echo "  - golangci-lint (linter aggregator)"
echo "  - gosec (security scanner)"
echo "  - govulncheck (vulnerability scanner)"
echo "  - gocyclo (complexity analyzer)"
echo "  - staticcheck (advanced static analysis)"
echo ""
echo "Verify installation:"
echo "  golangci-lint --version"
echo "  gosec --version"
echo "  govulncheck --version"
echo "  gocyclo --version"
echo "  staticcheck --version"
echo ""

exit 0
