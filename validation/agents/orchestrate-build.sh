#!/bin/bash
# Master Orchestration Script — Outline-Strong v2.0
# Purpose: Full workflow from requirements to validated implementation
# Usage: ./orchestrate-build.sh "<requirements-description-or-file>"

set -e

REQUIREMENTS=$1

if [[ -z "$REQUIREMENTS" ]]; then
    echo "Usage: $0 \"<requirements-description-or-file>\""
    echo ""
    echo "Example:"
    echo "  $0 \"Build analytics dashboard with real-time metrics\""
    echo "  $0 requirements.md"
    exit 1
fi

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

SPEC_DIR=".outline/specs"
LOCKED_DIR=".outline/outline-strong/locked"
ARTIFACT_DIR=".outline/outline-strong/artifacts"

mkdir -p "$SPEC_DIR" "$LOCKED_DIR" "$ARTIFACT_DIR"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     OUTLINE-STRONG v2.0 — Build Orchestrator                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Requirements: $REQUIREMENTS"
echo ""

# ============================================================================
# PHASE 1: SPECIFICATION GENERATION
# ============================================================================

echo "════════════════════════════════════════════════════════════════"
echo "PHASE 1: Specification Generation"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Tier 1: System Spec
echo "Step 1: Generate Tier 1 (System) Specification"
echo ""
echo "📝 Action required:"
echo "   In a NEW Claude Code session, invoke:"
echo "   \"Generate Tier 1 system specification from: $REQUIREMENTS\""
echo ""
echo "   Save output to: $SPEC_DIR/system-spec.md"
echo ""
read -p "Press Enter when system-spec.md is ready for review..."
echo ""

if [[ ! -f "$SPEC_DIR/system-spec.md" ]]; then
    echo "❌ File not found: $SPEC_DIR/system-spec.md"
    exit 1
fi

echo "Review system-spec.md..."
echo ""
read -p "Approve system spec? (y/n): " approve

if [[ "$approve" != "y" ]]; then
    echo "❌ User rejected system spec"
    exit 1
fi

# Lock system spec
echo "🔒 Locking system-spec.md..."
sha256sum "$SPEC_DIR/system-spec.md" > "$LOCKED_DIR/system-spec.md.lock"
echo "✅ Locked"
echo ""

# Extract subsystems from spec (manual for now)
echo "List subsystems from system-spec.md (comma-separated):"
read -p "Subsystems: " subsystems_input
IFS=',' read -ra SUBSYSTEMS <<< "$subsystems_input"

echo ""
echo "Subsystems: ${SUBSYSTEMS[*]}"
echo ""

# Tier 2: Subsystem Specs
for subsystem in "${SUBSYSTEMS[@]}"; do
    subsystem=$(echo "$subsystem" | xargs) # trim whitespace

    echo "────────────────────────────────────────────────────────────────"
    echo "Step 2: Generate Tier 2 Specification for: $subsystem"
    echo "────────────────────────────────────────────────────────────────"
    echo ""
    echo "📝 Action required (NEW session):"
    echo "   \"Generate Tier 2 specification for subsystem '$subsystem' from system-spec.md\""
    echo ""
    echo "   Save to: $SPEC_DIR/subsystem-${subsystem}.md"
    echo ""
    read -p "Press Enter when ready..."
    echo ""

    if [[ ! -f "$SPEC_DIR/subsystem-${subsystem}.md" ]]; then
        echo "❌ File not found: $SPEC_DIR/subsystem-${subsystem}.md"
        exit 1
    fi

    read -p "Approve subsystem spec for $subsystem? (y/n): " approve

    if [[ "$approve" != "y" ]]; then
        echo "❌ User rejected subsystem spec"
        exit 1
    fi

    echo "🔒 Locking subsystem-${subsystem}.md..."
    sha256sum "$SPEC_DIR/subsystem-${subsystem}.md" > "$LOCKED_DIR/subsystem-${subsystem}.md.lock"
    echo "✅ Locked"
    echo ""
done

# Tier 3: Component Specs (for each subsystem)
ALL_COMPONENTS=()

for subsystem in "${SUBSYSTEMS[@]}"; do
    subsystem=$(echo "$subsystem" | xargs)

    echo "List components for subsystem '$subsystem' (comma-separated):"
    read -p "Components: " components_input
    IFS=',' read -ra COMPONENTS <<< "$components_input"

    for component in "${COMPONENTS[@]}"; do
        component=$(echo "$component" | xargs)
        ALL_COMPONENTS+=("$component")

        echo "────────────────────────────────────────────────────────────────"
        echo "Step 3: Generate Tier 3 Specification for: $component"
        echo "────────────────────────────────────────────────────────────────"
        echo ""
        echo "📝 Action required (NEW session):"
        echo "   \"Generate Tier 3 specification for component '$component' from subsystem-${subsystem}.md\""
        echo ""
        echo "   Save to: $SPEC_DIR/comp-${component}.md"
        echo ""
        read -p "Press Enter when ready..."
        echo ""

        if [[ ! -f "$SPEC_DIR/comp-${component}.md" ]]; then
            echo "❌ File not found: $SPEC_DIR/comp-${component}.md"
            exit 1
        fi

        read -p "Approve component spec for $component? (y/n): " approve

        if [[ "$approve" != "y" ]]; then
            echo "❌ User rejected component spec"
            exit 1
        fi

        echo "🔒 Locking comp-${component}.md..."
        sha256sum "$SPEC_DIR/comp-${component}.md" > "$LOCKED_DIR/comp-${component}.md.lock"
        echo "✅ Locked"
        echo ""
    done
done

# Integration Spec
echo "════════════════════════════════════════════════════════════════"
echo "Step 4: Generate Integration Specification"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📝 Action required (NEW session):"
echo "   \"Generate integration specification from all tier3 specs in $SPEC_DIR/\""
echo ""
echo "   Save to: $SPEC_DIR/integration.md"
echo ""
read -p "Press Enter when ready..."
echo ""

if [[ ! -f "$SPEC_DIR/integration.md" ]]; then
    echo "❌ File not found: $SPEC_DIR/integration.md"
    exit 1
fi

read -p "Approve integration spec? (y/n): " approve

if [[ "$approve" != "y" ]]; then
    echo "❌ User rejected integration spec"
    exit 1
fi

echo "🔒 Locking integration.md..."
sha256sum "$SPEC_DIR/integration.md" > "$LOCKED_DIR/integration.md.lock"
echo "✅ All specifications locked"
echo ""

# ============================================================================
# PHASE 2: ARTIFACT GENERATION & VALIDATION
# ============================================================================

echo "════════════════════════════════════════════════════════════════"
echo "PHASE 2: Artifact Generation & Validation"
echo "════════════════════════════════════════════════════════════════"
echo ""

for component in "${ALL_COMPONENTS[@]}"; do
    component=$(echo "$component" | xargs)

    echo "────────────────────────────────────────────────────────────────"
    echo "Component: $component"
    echo "────────────────────────────────────────────────────────────────"
    echo ""

    comp_artifact_dir="$ARTIFACT_DIR/$component"
    mkdir -p "$comp_artifact_dir"

    # Artifact Generation Loop
    audit_passed=false
    audit_iteration=1

    while [[ "$audit_passed" == "false" ]]; do
        echo "[Iteration $audit_iteration] Generating validation artifacts..."
        echo ""
        echo "📝 Action required (NEW session):"
        echo "   \"Generate validation artifacts for component '$component'"
        echo "    from comp-${component}.md and integration.md\""
        echo ""
        echo "   Save artifacts to: $comp_artifact_dir/"
        echo "   - correspondence-${component}.json"
        echo "   - completeness-${component}.json"
        echo "   - test-requirements-${component}.md"
        echo "   - architecture-baseline-${component}.json"
        echo ""
        read -p "Press Enter when artifacts generated..."
        echo ""

        # Artifact Audit
        echo "🔍 Auditing artifacts (NEW session)..."
        echo ""
        echo "📝 Action required (FRESH session, no previous context):"
        echo "   \"Audit validation artifacts for component '$component'."
        echo "    Spec: $SPEC_DIR/comp-${component}.md"
        echo "    Integration: $SPEC_DIR/integration.md"
        echo "    Artifacts: $comp_artifact_dir/\""
        echo ""
        echo "   Generate audit report"
        echo ""
        read -p "Press Enter when audit complete..."
        echo ""

        read -p "Did audit PASS? (y/n): " audit_result

        if [[ "$audit_result" == "y" ]]; then
            audit_passed=true
            echo "✅ Audit passed"
        else
            echo "❌ Audit failed, regenerating artifacts..."
            audit_iteration=$((audit_iteration + 1))
        fi
        echo ""
    done

    # Lock artifacts
    echo "🔒 Locking artifacts for $component..."
    cd "$comp_artifact_dir"
    tar -czf "../${component}-artifacts.tar.gz" ./*
    cd "$PROJECT_ROOT"
    sha256sum "$ARTIFACT_DIR/${component}-artifacts.tar.gz" > "$LOCKED_DIR/${component}-artifacts.tar.gz.lock"
    echo "✅ Artifacts locked"
    echo ""
done

# ============================================================================
# PHASE 3: CODE GENERATION & VALIDATION
# ============================================================================

echo "════════════════════════════════════════════════════════════════"
echo "PHASE 3: Code Generation & Validation"
echo "════════════════════════════════════════════════════════════════"
echo ""

for component in "${ALL_COMPONENTS[@]}"; do
    component=$(echo "$component" | xargs)

    echo "────────────────────────────────────────────────────────────────"
    echo "Component: $component"
    echo "────────────────────────────────────────────────────────────────"
    echo ""

    # Determine language (ask user for now)
    read -p "Language for $component (go/typescript/python/shell): " language

    # Code Generation (one-shot)
    echo "⚙️  Generating code (ONE-SHOT)..."
    echo ""
    echo "📝 Action required (NEW session):"
    echo "   \"Generate implementation for component '$component'"
    echo "    Language: $language"
    echo "    Spec: $SPEC_DIR/comp-${component}.md"
    echo "    Integration: $SPEC_DIR/integration.md"
    echo "    Artifacts: $ARTIFACT_DIR/$component/\""
    echo ""
    echo "   Implement in appropriate directory for language"
    echo ""
    read -p "Press Enter when code generated..."
    echo ""

    read -p "Path to generated code: " code_path

    # Initial Validation
    echo "🧪 Running validation..."
    echo ""

    if bash .outline/outline-strong/validate-component.sh "$code_path" "$language"; then
        echo ""
        echo "✅ Validation passed on first attempt!"
        echo ""
        continue
    fi

    # Fix Loop (unlimited iterations)
    echo ""
    echo "❌ Validation failed, entering fix loop..."
    echo ""

    iteration=1
    while true; do
        echo "════════════════════════════════════════════════════════════════"
        echo "Fix Iteration $iteration for $component"
        echo "════════════════════════════════════════════════════════════════"
        echo ""

        echo "📝 Action required (FRESH session):"
        echo "   \"Fix validation failure for component '$component'"
        echo "    Iteration: $iteration"
        echo "    Spec: $SPEC_DIR/comp-${component}.md (LOCKED)"
        echo "    Artifacts: $ARTIFACT_DIR/$component/ (LOCKED)"
        echo "    Current code: $code_path"
        echo "    Language: $language"
        echo "    Previous validation errors: [review output above]\""
        echo ""
        echo "   Generate fixed implementation"
        echo ""
        read -p "Press Enter when fix ready..."
        echo ""

        read -p "Path to fixed code (or same path if in-place fix): " code_path

        echo "🧪 Re-running validation..."
        echo ""

        if bash .outline/outline-strong/validate-component.sh "$code_path" "$language"; then
            echo ""
            echo "════════════════════════════════════════════════════════════════"
            echo "✅ VALIDATION PASSED at iteration $iteration"
            echo "════════════════════════════════════════════════════════════════"
            echo ""
            break
        else
            echo ""
            echo "❌ Still failing at iteration $iteration"
            echo ""
            iteration=$((iteration + 1))

            read -p "Continue fixing? (y/n/manual): " continue_fix

            if [[ "$continue_fix" == "n" ]]; then
                echo "❌ User stopped fix loop for $component"
                exit 130
            elif [[ "$continue_fix" == "manual" ]]; then
                echo "⚠️  Entering manual intervention mode"
                echo "Fix the code manually, then re-run orchestrator or validate directly"
                exit 130
            fi
        fi
    done
done

# ============================================================================
# PHASE 4: INTEGRATION TEST
# ============================================================================

echo "════════════════════════════════════════════════════════════════"
echo "PHASE 4: Integration Test"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "🧪 Running integration tests..."
echo ""
echo "Verify all components work together"
echo ""
read -p "Run integration tests now? (y/n): " run_integration

if [[ "$run_integration" == "y" ]]; then
    # User specifies integration test command
    read -p "Integration test command: " integration_cmd

    if eval "$integration_cmd"; then
        echo ""
        echo "✅ Integration tests passed"
    else
        echo ""
        echo "❌ Integration tests failed"
        exit 5
    fi
else
    echo "⚠️  Skipped integration tests"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ BUILD COMPLETE"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "All components implemented and validated!"
echo ""
echo "Summary:"
echo "  Subsystems: ${#SUBSYSTEMS[@]}"
echo "  Components: ${#ALL_COMPONENTS[@]}"
echo "  Specifications: Locked in $LOCKED_DIR/"
echo "  Artifacts: Locked in $LOCKED_DIR/"
echo ""

exit 0
