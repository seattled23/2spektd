# Code Fix Agent — One-Shot Fix Generator

**Purpose**: Fix validation failures in implementation

**CRITICAL**: Each invocation gets ONE attempt. Loops indefinitely until validation passes.

---

## Inputs

1. **Component Specification** (tier3 spec, locked)
2. **Integration Specification** (locked)
3. **Validation Artifacts** (locked)
4. **Current Implementation** (code that failed)
5. **Validation Errors** (output from validate-component.sh)
6. **Iteration Count** (informational only)

## Outputs

1. **Fixed Implementation** (modified source)
2. **Fix Notes** (what was changed and why)

---

## Prompt Template

```
You are a code fixer. You get ONE attempt to fix validation failures.

Iteration: [ITERATION] (will loop until passing)

Component specification:
[COMP_SPEC]

Integration specification:
[INTEGRATION_SPEC]

Validation artifacts (LOCKED, cannot modify):
[ARTIFACTS]

Current implementation:
[CURRENT_CODE]

Validation errors:
[VALIDATION_OUTPUT]

Failed at layer: [LAYER_NUMBER] ([LAYER_NAME])
Exit code: [EXIT_CODE]

Your task:
1. Analyze the validation failure
2. Identify root cause
3. Fix ONLY what's needed to pass this layer
4. Do NOT break previously passing layers

Constraints:
- Cannot modify specs (locked)
- Cannot modify artifacts (locked)
- Cannot adjust tests to match code
- Must fix code to match spec

Output:
1. Fixed source files
2. Brief explanation of fix

ONE SHOT: This fix will be validated immediately. No refinement.
```

---

## Iteration Loop

```bash
iteration=1
while true; do
    echo "════════════════════════════════════════════════════════════════"
    echo "Fix Iteration $iteration"
    echo "════════════════════════════════════════════════════════════════"
    echo ""

    # Generate fix (new context each time)
    code-fix-agent.sh spec.md integration.md artifacts/ current-code/ errors.txt $iteration > fixed-code/

    # Validate fix
    if validate-component.sh fixed-code/ LANGUAGE; then
        echo ""
        echo "════════════════════════════════════════════════════════════════"
        echo "✅ VALIDATION PASSED at iteration $iteration"
        echo "════════════════════════════════════════════════════════════════"
        exit 0
    else
        echo ""
        echo "❌ Still failing at iteration $iteration"
        echo "Analyzing errors and preparing next fix attempt..."
        echo ""

        # Update current code for next iteration
        current-code=fixed-code
        iteration=$((iteration + 1))

        # Brief pause to allow user to interrupt if needed
        sleep 1
    fi
done
```

**Note**: Loop continues indefinitely. User can interrupt (Ctrl+C) if fundamental issue suspected.

---

## Manual Intervention

User can stop loop and intervene if:
- Iterations exceed reasonable count (e.g., >50)
- Same error repeating (no progress)
- Fundamental spec/artifact issue suspected

To stop: Press Ctrl+C, then investigate:
- Review validation errors for patterns
- Check if spec is ambiguous
- Verify artifacts are correct
- Consider manual implementation or spec revision

---

## Invocation

**Manual**:
```bash
# In NEW Claude Code session:
"Fix validation failure for component [NAME]. Failed at layer [N] with error: [ERROR]"
```

**Automated** (future):
```bash
bash .spec2/outline-strong/agents/code-fix-agent.sh comp-NAME.md integration.md artifacts/ current-code/ errors.txt 1 output/
```

---

## Anti-Reward-Hacking

Each fix attempt in fresh context prevents:
- Learning validation patterns
- Gaming specific tests
- Incrementally discovering "correct answer"

Forces correct implementation from understanding spec, not trial-and-error.
