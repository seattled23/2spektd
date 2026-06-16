#!/usr/bin/env bash
# spec2-remediate.sh — Validate-and-Remediate existing code.
#
# The missing half of spec2: `spec2-new` GENERATES code from requirements with
# validation; the legacy `/spec2:upgrade` skill only DESCRIBED a remediation loop
# in prose (no entry_point, no executable, no fix loop). This is that loop, real.
#
# What it does, per invocation:
#   1. Runs the existing 12-layer validator (validation/validate-component.sh)
#      against an EXISTING component — reusing every layer script as-is (§9.5
#      don't-reinvent; §1.7 fix-upstream not around).
#   2. Filters layer findings through lib/exempt-findings.sh so meta-content and
#      allowlisted false positives stop blocking (fixes IMPLEMENTATION-STATUS
#      "Known Issue #1").
#   3. Classifies the failing layer as AUTO-FIXABLE, ADVISORY, or NEEDS-HUMAN.
#   4. In --fix mode: applies the deterministic auto-fixes it CAN make safely
#      (goimports, gofmt, ruff --fix, dependency bumps for known-CVE modules),
#      re-runs validation, and loops until PASS or no further progress
#      (convergence) or --max-iter reached.
#   5. NEVER edits assertions to pass, never lowers a threshold, never --no-verify
#      (kernel §1.7 forbidden-workarounds, §5 floors). Anything not deterministically
#      safe is reported as NEEDS-HUMAN with the exact location, not silently changed.
#
# Out-of-repo support: a bare file or a dir with no git root is staged into an
# ephemeral git-init'd workspace so layer scripts that `git rev-parse` still work
# (today's hook-validation pain — fixed here, not worked around per-call).
#
# Usage:
#   spec2-remediate.sh <component-path> [language] [--fix] [--max-iter N] [--report PATH]
#
# Exit: 0 = component PASSES (after any fixes). Non-zero = unresolved findings
#       remain (exit code = the failing layer's code, per the orchestrator contract).
#
# Co-authored: David Everett + Sōren Vale.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC2_ROOT="$(cd "$HERE/.." && pwd)"
ORCHESTRATOR="$SPEC2_ROOT/validation/validate-component.sh"
MODULES="$SPEC2_ROOT/validation/modules"
EXEMPT="$HERE/lib/exempt-findings.sh"

# ── args ──────────────────────────────────────────────────────────────────────
COMPONENT="${1:-}"
LANGUAGE="${2:-}"
FIX=0
MAX_ITER=5
REPORT=""

# Re-scan args (positional 1/2 already taken; flags can appear anywhere after).
shift_count=0
for a in "$@"; do
    case "$a" in
        --fix) FIX=1 ;;
        --max-iter) ;;  # value consumed below
        --report) ;;
    esac
done
# Pull flag values.
while [[ $# -gt 0 ]]; do
    case "$1" in
        --max-iter) MAX_ITER="${2:-5}"; shift 2 ;;
        --report)   REPORT="${2:-}";   shift 2 ;;
        *) shift ;;
    esac
done

if [[ -z "$COMPONENT" ]]; then
    cat >&2 <<EOF
Usage: spec2-remediate.sh <component-path> [language] [--fix] [--max-iter N] [--report PATH]

  <component-path>  file or directory to validate (relative to repo, or absolute)
  [language]        go | python | typescript | shell  (auto-detected if omitted)
  --fix             enter the auto-fix loop (default: report-only)
  --max-iter N      max fix iterations before giving up (default: 5)
  --report PATH     write a JSON remediation report to PATH
EOF
    exit 64
fi

# ── language auto-detection ───────────────────────────────────────────────────
detect_language() {
    local path="$1"
    local target="$path"
    [[ -f "$path" ]] && target="$(dirname "$path")"
    if   fd -e go   -q . "$target" 2>/dev/null | grep -q .; then echo go
    elif fd -e py   -q . "$target" 2>/dev/null | grep -q .; then echo python
    elif fd -e ts   -q . "$target" 2>/dev/null | grep -q .; then echo typescript
    elif fd -e sh   -q . "$target" 2>/dev/null | grep -q .; then echo shell
    else echo ""; fi
}
if [[ -z "$LANGUAGE" ]]; then
    LANGUAGE="$(detect_language "$COMPONENT")"
    if [[ -z "$LANGUAGE" ]]; then
        echo "❌ Could not auto-detect language for '$COMPONENT' — pass it explicitly." >&2
        exit 64
    fi
    echo "ℹ️  Auto-detected language: $LANGUAGE"
fi
if [[ ! -d "$MODULES/$LANGUAGE" ]]; then
    echo "❌ No validation module for language: $LANGUAGE (have: $(ls "$MODULES"))" >&2
    exit 64
fi

# ── out-of-repo staging ───────────────────────────────────────────────────────
# Layer scripts call `git rev-parse --show-toplevel`. If the target is not inside
# a git repo (e.g. ~/.claude/hooks/*.py), stage a copy into a throwaway git repo
# so validation runs identically — instead of failing or forcing the caller to
# git-init by hand (today's pain).
STAGE_DIR=""
RUN_ROOT=""
RUN_COMPONENT=""
cleanup() { [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]] && rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

abs_component="$(cd "$(dirname "$COMPONENT")" 2>/dev/null && pwd)/$(basename "$COMPONENT")"
if git -C "$(dirname "$abs_component")" rev-parse --show-toplevel >/dev/null 2>&1; then
    RUN_ROOT="$(git -C "$(dirname "$abs_component")" rev-parse --show-toplevel)"
    RUN_COMPONENT="$(realpath --relative-to="$RUN_ROOT" "$abs_component")"
    echo "ℹ️  In-repo: root=$RUN_ROOT component=$RUN_COMPONENT"
else
    STAGE_DIR="$(mktemp -d /tmp/spec2-remediate.XXXXXX)"
    echo "ℹ️  Target is outside a git repo — staging into ephemeral workspace: $STAGE_DIR"
    if [[ -f "$abs_component" ]]; then
        cp "$abs_component" "$STAGE_DIR/"
        RUN_COMPONENT="."
    else
        cp -r "$abs_component/." "$STAGE_DIR/"
        RUN_COMPONENT="."
    fi
    git -C "$STAGE_DIR" init -q
    git -C "$STAGE_DIR" add -A 2>/dev/null || true
    RUN_ROOT="$STAGE_DIR"
fi

# ── run a single validation pass, return failing-layer exit code (0 = pass) ───
LAST_OUTPUT=""
run_validation() {
    local out
    set +e
    out="$( cd "$RUN_ROOT" && bash "$ORCHESTRATOR" "$RUN_COMPONENT" "$LANGUAGE" 2>&1 )"
    local code=$?
    set -e 2>/dev/null || true
    LAST_OUTPUT="$out"
    return $code
}

# ── apply the exempt filter to the raw finding lines in LAST_OUTPUT ────────────
# Returns 0 if, after filtering, the ONLY thing that failed was a layer whose
# real findings are all suppressed (meta-content / allowlisted) — i.e. a false
# alarm. Sets FILTERED_NOTE for the report.
FILTERED_NOTE=""
findings_all_suppressed() {
    # Pull lines that look like `path:line: ...` findings out of the layer output.
    local findings
    findings="$(printf '%s\n' "$LAST_OUTPUT" | grep -E '^[^:]+:[0-9]+:' || true)"
    [[ -z "$findings" ]] && return 1   # nothing parseable → not a false alarm we can clear
    local survivors
    survivors="$( cd "$RUN_ROOT" && printf '%s\n' "$findings" | SPEC2_ALLOWLIST="${SPEC2_ALLOWLIST:-.spec2/hollow-allowlist.txt}" bash "$EXEMPT" 2>/tmp/spec2-exempt.err )"
    FILTERED_NOTE="$(cat /tmp/spec2-exempt.err 2>/dev/null || true)"
    [[ -z "$(printf '%s' "$survivors" | tr -d '[:space:]')" ]]
}

# ── deterministic auto-fixers (only the provably-safe ones) ───────────────────
apply_autofix_for_layer() {
    local layer="$1"   # e.g. "Layer 0" / "Layer -1"
    local changed=0
    cd "$RUN_ROOT"
    case "$LANGUAGE" in
        go)
            # Formatting + imports are deterministic and never change semantics.
            if command -v goimports >/dev/null 2>&1; then
                goimports -w "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
            fi
            gofmt -w "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
            # Known transitive-CVE bumps (Layer 4 / govulncheck): only modules with
            # a known fixed-version, applied via `go get`, then `go mod tidy`.
            if printf '%s' "$LAST_OUTPUT" | grep -q 'govulncheck found'; then
                # Parse `Module: X` + `Fixed in: X@vY` pairs and bump each.
                printf '%s\n' "$LAST_OUTPUT" \
                  | grep -oE 'Fixed in: [^ ]+@v[0-9.]+' \
                  | sed 's/Fixed in: //' | sort -u \
                  | while IFS= read -r modver; do
                        echo "  ↻ go get $modver"
                        go get "$modver" 2>/dev/null || true
                    done
                go mod tidy 2>/dev/null && changed=1 || true
            fi
            ;;
        python)
            if command -v ruff >/dev/null 2>&1; then
                ruff check --fix "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
                ruff format "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
            fi
            ;;
        typescript)
            if command -v eslint >/dev/null 2>&1; then
                eslint --fix "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
            fi
            ;;
        shell)
            if command -v shfmt >/dev/null 2>&1; then
                shfmt -w "$RUN_COMPONENT" 2>/dev/null && changed=1 || true
            fi
            ;;
    esac
    return $((1 - changed))   # 0 if changed
}

# ── main loop ─────────────────────────────────────────────────────────────────
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║   spec2-remediate — Validate & Remediate Existing Code          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo "Component: $COMPONENT   Language: $LANGUAGE   Fix: $([[ $FIX -eq 1 ]] && echo on || echo off)   Max-iter: $MAX_ITER"
echo ""

iter=0
final_code=0
status="UNKNOWN"
notes=()

while :; do
    echo "──────── validation pass $iter ────────"
    if run_validation; then
        echo "✅ ALL LAYERS PASSED"
        status="PASS"; final_code=0
        break
    fi
    final_code=$?
    failing_layer="$(printf '%s\n' "$LAST_OUTPUT" | grep -oE 'VALIDATION FAILED at Layer [^:]+' | head -1)"
    failing_layer="${failing_layer:-Layer (exit $final_code)}"
    echo "❌ $failing_layer (exit $final_code)"

    # False-alarm check: are all real findings suppressed by exempt filter?
    if findings_all_suppressed; then
        echo "ℹ️  All findings at $failing_layer are meta-content / allowlisted false positives:"
        printf '%s\n' "$FILTERED_NOTE" | sed 's/^/      /'
        notes+=("$failing_layer: cleared as false-positive (see allowlist / meta-content rule)")
        status="PASS_WITH_EXEMPTIONS"; final_code=0
        break
    fi

    if [[ $FIX -eq 0 ]]; then
        echo "ℹ️  Report-only mode (no --fix). Stopping with findings at $failing_layer."
        status="FINDINGS_REPORTED"
        break
    fi

    if [[ $iter -ge $MAX_ITER ]]; then
        echo "⚠️  Reached --max-iter $MAX_ITER without convergence."
        status="MAX_ITER_REACHED"
        break
    fi

    echo "🔧 Attempting deterministic auto-fix for $failing_layer ..."
    if apply_autofix_for_layer "$failing_layer"; then
        echo "   applied changes; re-validating."
        notes+=("iter $iter: auto-fix applied for $failing_layer")
    else
        echo "   no deterministic auto-fix available for $failing_layer → NEEDS-HUMAN."
        notes+=("$failing_layer: NEEDS-HUMAN (no safe auto-fix; see findings above)")
        status="NEEDS_HUMAN"
        break
    fi
    iter=$((iter + 1))
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "RESULT: $status   (exit $final_code, $iter fix-iteration(s))"
[[ ${#notes[@]} -gt 0 ]] && printf '  - %s\n' "${notes[@]}"
echo "════════════════════════════════════════════════════════════════"

# ── optional JSON report ──────────────────────────────────────────────────────
if [[ -n "$REPORT" ]]; then
    {
        printf '{\n'
        printf '  "component": "%s",\n' "$COMPONENT"
        printf '  "language": "%s",\n' "$LANGUAGE"
        printf '  "fix_mode": %s,\n' "$([[ $FIX -eq 1 ]] && echo true || echo false)"
        printf '  "iterations": %d,\n' "$iter"
        printf '  "status": "%s",\n' "$status"
        printf '  "exit_code": %d,\n' "$final_code"
        printf '  "notes": ['
        for i in "${!notes[@]}"; do
            esc="${notes[$i]//\"/\\\"}"
            printf '%s"%s"' "$([[ $i -gt 0 ]] && echo ', ')" "$esc"
        done
        printf ']\n}\n'
    } > "$REPORT"
    echo "ℹ️  Report written: $REPORT"
fi

exit $final_code
