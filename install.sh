#!/bin/bash
# 2spektd Installation Script
# Purpose: One-command setup for 2spektd

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              2spektd — Installation                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

INSTALL_DIR=$(pwd)

# Step 1: Install Python package
echo "[1/4] Installing Python package..."
if pip install -e .; then
    echo "✅ Python package installed"
else
    echo "❌ Failed to install Python package"
    exit 1
fi
echo ""

# Step 2: Install validation tools
echo "[2/4] Which validation tools do you want to install?"
echo "  1) All languages (go, typescript, python, shell)"
echo "  2) Go only"
echo "  3) TypeScript only"
echo "  4) Python only"
echo "  5) Shell only"
echo "  6) Skip (install later)"
read -p "Choice (1-6): " tool_choice

case $tool_choice in
    1)
        bash validation/modules/go/install-tools.sh
        bash validation/modules/typescript/install-tools.sh
        bash validation/modules/python/install-tools.sh
        bash validation/modules/shell/install-tools.sh
        ;;
    2)
        bash validation/modules/go/install-tools.sh
        ;;
    3)
        bash validation/modules/typescript/install-tools.sh
        ;;
    4)
        bash validation/modules/python/install-tools.sh
        ;;
    5)
        bash validation/modules/shell/install-tools.sh
        ;;
    6)
        echo "Skipping validation tools installation"
        ;;
    *)
        echo "Invalid choice, skipping"
        ;;
esac
echo ""

# Step 3: Install Claude Code skills
echo "[3/4] Install Claude Code skills?"
read -p "Install to ~/.claude/skills/? (y/n): " install_skills

if [[ "$install_skills" == "y" ]]; then
    mkdir -p ~/.claude/skills
    ln -sf "$INSTALL_DIR/skills/2spektd-new" ~/.claude/skills/
    ln -sf "$INSTALL_DIR/skills/2spektd-upgrade" ~/.claude/skills/
    echo "✅ Skills installed"
    echo "   /2spektd:new - Build new component"
    echo "   /2spektd:upgrade - Validate existing code"
else
    echo "Skipped skills installation"
fi
echo ""

# Step 4: Configure MCP server
echo "[4/4] Configure MCP server?"
read -p "Add to ~/.claude.json? (y/n): " install_mcp

if [[ "$install_mcp" == "y" ]]; then
    claude_json=~/.claude.json

    # Create file if doesn't exist
    if [[ ! -f "$claude_json" ]]; then
        echo '{"mcpServers": {}}' > "$claude_json"
    fi

    # Add server config
    cat <<EOF

Add this to $claude_json:

{
  "mcpServers": {
    "2spektd": {
      "command": "python",
      "args": ["$INSTALL_DIR/mcp-server/server.py"]
    }
  }
}

EOF
    echo "⚠️  Manual step required: Edit $claude_json"
else
    echo "Skipped MCP server configuration"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "✅ Installation Complete"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Test validation: bash validation/validate-component.sh <path> <lang>"
echo "  2. Use skills in Claude Code: /2spektd:new or /2spektd:upgrade"
echo "  3. Read docs: cat README.md"
echo ""
echo "Documentation:"
echo "  - README.md — Overview and usage"
echo "  - validation/QUICK-START.md — Quick reference"
echo "  - validation/OUTLINE-STRONG-V2-SPEC.md — Complete spec"
echo "  - CONTRIBUTING.md — Development guide"
echo ""

exit 0
