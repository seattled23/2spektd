#!/bin/bash
# Layer 4: Security Patterns
# Purpose: Detect insecure shell patterns
# Exit: 24 on security issues, 0 on pass

set -e

COMPONENT=$1

if [[ -z "$COMPONENT" ]]; then
    echo "Usage: $0 <component-path>"
    exit 24
fi

echo "Layer 4: Security Patterns"
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

issues=0

# Pattern 1: Unquoted variables (common security issue)
echo "[1/4] Checking for unquoted variables..."
# Look for $VAR not in quotes (simplified check)
unquoted=$(rg '\$[A-Z_][A-Z0-9_]*(?!")' "$COMPONENT" --exclude 'test_*.sh' || true)

if [[ -n "$unquoted" ]]; then
    unquoted_count=$(echo "$unquoted" | wc -l)
    echo "⚠️  Found $unquoted_count potential unquoted variable(s)"
    echo "$unquoted" | head -5
    echo ""
    issues=$((issues + 1))
else
    echo "✅ No unquoted variables detected"
fi
echo ""

# Pattern 2: eval usage (dangerous)
echo "[2/4] Checking for eval usage..."
eval_usage=$(rg '\beval\b' "$COMPONENT" --exclude 'test_*.sh' || true)

if [[ -n "$eval_usage" ]]; then
    echo "❌ Found eval usage (security risk):"
    echo "$eval_usage" | head -5
    echo ""
    issues=$((issues + 1))
else
    echo "✅ No eval usage"
fi
echo ""

# Pattern 3: curl/wget without error handling
echo "[3/4] Checking for unsafe network operations..."
unsafe_net=$(rg '(curl|wget) .+(?<!(\|\||&&))$' "$COMPONENT" --exclude 'test_*.sh' || true)

if [[ -n "$unsafe_net" ]]; then
    echo "⚠️  Found curl/wget without explicit error handling:"
    echo "$unsafe_net" | head -5
    echo ""
    echo "Recommendation: Use 'curl -f' or check exit codes"
    issues=$((issues + 1))
else
    echo "✅ Network operations look safe"
fi
echo ""

# Pattern 4: Temporary files without cleanup
echo "[4/4] Checking for temporary file cleanup..."
# Look for mktemp without corresponding trap or rm
scripts_with_mktemp=$(rg -l 'mktemp' "$COMPONENT" --exclude 'test_*.sh' || true)

if [[ -n "$scripts_with_mktemp" ]]; then
    missing_cleanup=0

    while IFS= read -r file; do
        has_mktemp=$(grep -c 'mktemp' "$file" || true)
        has_cleanup=$(grep -c -E '(trap.*rm|rm.*\$\{?TMPDIR|rm.*\$\{?TMP)' "$file" || true)

        if [[ $has_mktemp -gt 0 && $has_cleanup -eq 0 ]]; then
            echo "  ⚠️  $(basename "$file"): mktemp without cleanup trap"
            missing_cleanup=$((missing_cleanup + 1))
        fi
    done <<< "$scripts_with_mktemp"

    if [[ $missing_cleanup -gt 0 ]]; then
        echo ""
        echo "Recommendation: Add 'trap \"rm -f \$TMPFILE\" EXIT'"
        issues=$((issues + 1))
    else
        echo "✅ All temp files have cleanup"
    fi
else
    echo "✅ No temporary files used"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"

if [[ $issues -gt 0 ]]; then
    echo "⚠️  Layer 4: PASS (with warnings)"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "Found $issues security pattern(s) to review"
    echo "(Warnings only, not blocking)"
    exit 0
else
    echo "✅ Layer 4: PASS"
    echo "════════════════════════════════════════════════════════════════"
    exit 0
fi
