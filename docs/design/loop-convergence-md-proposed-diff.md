# Proposed Revision — `~/.claude/skills/loop-convergence.md`

**Status:** PROPOSAL only — not applied. David must approve before the kernel skill changes.
**Source:** [loop-protocol-audit-2026-06-01.md](./loop-protocol-audit-2026-06-01.md) § 11 + § "Cost-capping required vs design-phase unbounded".
**Date drafted:** 2026-06-01.
**Author intent:** introduce `Mode: impl-phase | design-phase` to the loop-convergence skill so design-phase loops (meta-thinking, n-order-effects in Wave 0 / system-arch decisions) can terminate by convergence + stuck-detection instead of a numeric `max-iter`, while impl-phase loops (Wave 6 codegen regen, loop-engineering, loop-audit-fix) keep their cost-bounded numeric cap.

---

## What + Why (one-paragraph)

The current `loop-convergence.md` HARD-mandates a numeric `max-iter` for every loop and brands the absence as a HARD VIOLATION anti-pattern. This is correct for impl-phase loops (real code generation, per-iter cost 10-50K tokens) — but it directly contradicts the founder direction (2026-06-01) for design-phase loops, where "let it loop until it finishes" + "run a meta check after each n order loop as well" means convergence-based unbounded termination is the goal. Wave 0 design v1.1 already applies the pattern for the Wave 0b/0c decision-machinery; this proposal makes the foundational skill support it so every nesting skill (loop-engineering, loop-audit-fix, the chainable thinking skills via meta-thinking-audit) inherits the right semantics. Default mode stays `impl-phase` so every existing loop is unchanged — design-phase is opt-in via explicit mode declaration.

---

## Before — current state (verbatim, the affected sections)

### Section: `### Required` (tools), threshold declaration template (lines ~57-65)

```
- **Threshold declaration** — single line in `loop-log.md` header before iter 1:
  ```
  ## Convergence criteria
  Metric: <metric name + how it's measured>
  Threshold: <value at which loop terminates clean>
  Max iterations: <hard cap>
  Plateau ε: <delta below which 3 iterations = plateau>
  ```
```

### Section: `## Procedure`, step 3 (lines ~90-94)

```
3. **Define the max-iterations cap.** When to abandon. Examples:
   - 10 iterations for engineering loops (budget protection).
   - 5 iterations for audit-fix loops (more = the audit is wrong, not the fixes).
   - User-specified for custom loops.
   Required — no max-cap means a stuck loop runs forever.
```

### Section: `## Procedure`, step 6 (lines ~107-111)

```
6. **Stop verdicts (evaluated in this order each iteration):**
   - **threshold-hit** — metric ≥ threshold (or ≤ for minimization metrics). Clean exit.
   - **max-iterations** — iter count ≥ cap. Abandonment exit.
   - **plateau** — 3-iteration plateau detected. Surface exit.
   - **none** — continue to next iteration.
```

### Section: `## Anti-patterns` (relevant line, ~147)

```
- **No max-iter → infinite loop possible.** HARD VIOLATION. Always cap.
```

---

## After — proposed revision (verbatim, drop-in replacements)

### Section: `### Required` (tools), threshold declaration template — REPLACED

```
- **Threshold declaration** — single block in `loop-log.md` header before iter 1:
  ```
  ## Convergence criteria
  Mode: impl-phase | design-phase    ← REQUIRED; defaults to impl-phase if omitted
  Metric: <metric name + how it's measured>
  Threshold: <value at which loop terminates clean>
  Max iterations: <hard cap>          ← REQUIRED for impl-phase; OMIT for design-phase
  Plateau ε: <delta below which N iterations = plateau>
  Cycle-detection: <fingerprint scheme>      ← REQUIRED for design-phase; optional for impl-phase
  Stuck-detection: <fingerprint + N consecutive iters>  ← REQUIRED for design-phase; optional for impl-phase
  ```

  **Mode semantics:**
  - `impl-phase` (default) — each iteration produces real code/refactor/polish work (LOC scale, 10-50K tokens). Numeric `Max iterations` REQUIRED; cost discipline applies (kernel §1.10). All existing loops without an explicit mode declaration are impl-phase.
  - `design-phase` — each iteration produces design artifacts (meta-check verdicts, n-order traces, architecture candidates) at 1-3 LLM calls / 5-15K tokens. `Max iterations` OMITTED; termination is convergence-only via threshold-hit + plateau-of-zero + cycle-detected + stuck-on-finding rails. Use when downstream cost of premature termination (defect propagating to impl-phase) dwarfs per-iter cost.

  **Rule of thumb for declaring design-phase:** the loop produces design artifacts (not code), AND a wrong-converged loop costs ≥10× more downstream than an extra iteration costs now.
```

### Section: `## Procedure`, step 3 — REPLACED

```
3. **Define the max-iterations cap (impl-phase) OR cycle/stuck-detection rails (design-phase).**

   **If `Mode: impl-phase`:** define `Max iterations` — when to abandon. Examples:
   - 10 iterations for engineering loops (budget protection).
   - 5 iterations for audit-fix loops (more = the audit is wrong, not the fixes).
   - User-specified for custom loops.
   Required — no max-cap on an impl-phase loop means a stuck loop runs forever.

   **If `Mode: design-phase`:** OMIT `Max iterations` and define BOTH rails instead:
   - **Plateau-of-zero rule:** the audit/meta-check returns 0 findings for N=2 consecutive iterations → clean exit (the design has converged; no further gaps surface).
   - **Cycle-detection:** define a candidate/finding fingerprint scheme (e.g. structural hash of the proposed frame, the n-order chain's terminal nodes, the actor-critic winner). If the same fingerprint appears in a later iteration after passing once → cycle exit; the design space has been re-explored.
   - **Stuck-on-finding escalation:** same finding (structural fingerprint) appears N=3+ consecutive iterations *without* the design/candidate changing → escalate to user (the LLM cannot fix this gap; surfacing it as a known limitation is the correct termination).
   Required — no cycle/stuck-detection on a design-phase loop means an ill-posed loop runs until session compaction.
```

### Section: `## Procedure`, step 6 — REPLACED

```
6. **Stop verdicts (evaluated in this order each iteration):**

   **All modes:**
   - **threshold-hit** — metric ≥ threshold (or ≤ for minimization metrics). Clean exit.
   - **plateau** — N-iteration plateau detected (default N=3 with |delta| < ε; design-phase plateau-of-zero is N=2 with finding count = 0). Surface or clean exit per mode.

   **Impl-phase only:**
   - **max-iterations** — iter count ≥ cap. Abandonment exit. Surface to user with trajectory.

   **Design-phase only:**
   - **cycle-detected** — candidate/finding/frame fingerprint matches a prior iteration's. Clean exit; flag in verdict so the user can confirm the design space was actually exhausted vs. agent re-proposing the same thing.
   - **stuck-on-finding** — same finding fingerprint appears N=3+ consecutive iters without design change. Escalation exit; surface to user with the stuck finding as a known limitation.

   - **none** — continue to next iteration.
```

### Section: `## Anti-patterns` — REPLACED (the single line at ~147)

```
- **No max-iter on an impl-phase loop → infinite loop possible.** HARD VIOLATION. Impl-phase always caps.
- **Numeric max-iter on a design-phase loop → premature termination.** SOFT VIOLATION (cost-tunable case-by-case, but default is convergence-only — see Wave 0 v1.1 design + founder direction 2026-06-01).
- **Design-phase loop without cycle-detection AND stuck-detection.** HARD VIOLATION. The two rails together REPLACE the impl-phase max-iter requirement; missing either means the loop has no natural-termination floor and can burn the full session budget on an unfixable finding.
- **Omitted Mode declaration.** SOFT VIOLATION — defaults to impl-phase for backward compatibility, but every new loop SHOULD declare the mode explicitly.
```

---

## Why — rationale (tied to the audit)

**1. The audit (§ 11) identifies `loop-convergence.md` as the foundational skill.** Every nesting loop (engineering, audit-fix, plus the chainable thinking skills via meta-thinking-audit / actor-critic-workflow / n-order-effects-with-actor-critic) inherits its requirements. As long as this skill mandates a numeric cap, every nesting skill is structurally required to declare one — which silently overrides the design-phase founder direction even where the nesting skill itself wants unbounded convergence. Fixing the foundation is the single highest-leverage change in the audit (the audit names it as the "single most important change to authorize first").

**2. Default-to-impl-phase preserves backward compatibility.** Every existing loop in the wild has no Mode declaration; the proposal treats absent-Mode as `impl-phase`. This means: nothing breaks on adoption; design-phase is purely opt-in via explicit declaration; the kernel §1.10 cost-discipline concerns for impl-phase are untouched. The audit's framing (impl-phase per-iter cost is high, design-phase per-iter cost is low but defect-propagation cost is high) maps cleanly to the two-mode split.

**3. Convergence-only termination is bounded — just by natural rails instead of arbitrary numerics.** The proposal is NOT "remove the cap, let it loop forever." It's "replace `Max iterations: 5` with `Plateau-of-zero (N=2) + Cycle-detection (fingerprint) + Stuck-on-finding (N=3 same fingerprint without change)`." Three rails. All three are natural termination signals that fire when the design space is exhausted OR when the LLM has hit a real limit it cannot fix. The audit § "Cost-capping required vs design-phase unbounded" makes this distinction explicit: design-phase loops are *softer*-bounded, not *un*-bounded.

---

## Risk — what could go wrong (honest)

**1. Mode mis-classification → loop blows budget.** If an agent declares `design-phase` on a loop that's actually generating real code per iter (e.g. a refactor loop that the agent mis-classified because the artifacts include design notes), the loop runs without a numeric cap and burns through token budget on impl-phase work. **Mitigation:** the rule-of-thumb in the proposal ("design artifacts vs code artifacts; downstream cost ≥10× per-iter cost") is concrete and testable; an audit pass on first 10 design-phase loop declarations after rollout would catch mis-classifications. Adding a token-budget soft-warning trigger (per Wave 0 v1.1 §3.4) would harden this further; out of scope for this proposal but listed in the adoption checklist.

**2. Cycle-detection fingerprint is hard to define for fuzzy artifacts.** Structural hash works for code; for meta-check verdicts or n-order traces, the "same fingerprint" notion may be subjective. **Mitigation:** start with conservative fingerprinting (e.g. a hash of the top-3 findings sorted; or a hash of the locked-in frame name from meta-thinking). If two iterations produce semantically-identical-but-syntactically-different output, cycle-detection misses them — but stuck-on-finding (N=3 same finding) will catch it on the third iter. The two rails are redundant by design.

**3. Stuck-detection N=3 is a guess; could be too tight or too loose.** Too tight (N=2) → escalates on noise where the LLM would have fixed the gap on iter 4. Too loose (N=5) → burns iterations on a finding the LLM cannot fix. **Mitigation:** N=3 matches the existing 3-iter plateau detection across the skill; it's defensible as a default. Each design-phase loop can override N in its declaration if the metric is noisy (LLM-graded scores) or particularly deterministic (linter counts).

**4. Adoption gap — nesting skills don't yet read the Mode flag.** Until loop-engineering / loop-audit-fix / the chainable thinking skills are updated to pass through the design-phase context to loop-convergence, the new mode is theoretical. The audit enumerates the downstream changes; without them, this change is a no-op. **Mitigation:** see adoption checklist below — this is item-by-item trackable.

---

## Adoption Checklist — what else needs touching if David approves

Extracted from the [loop-protocol-audit-2026-06-01.md](./loop-protocol-audit-2026-06-01.md) summary table (§ row-by-row verdicts):

| # | File | Change |
|---|------|--------|
| 1 | `~/.claude/skills/loop-convergence.md` | **This proposal** — add Mode declaration; FOUNDATIONAL — must land first |
| 2 | `~/.claude/skills/meta-thinking-audit.md` | Add chain-in context detection (design-phase vs advisory-ask). Replace "hard cap 1 re-run (all contexts)" → "unbounded-with-convergence for design-phase; cap=1 for advisory-ask". Per audit § 2. **Highest-impact change for Wave 0 specifically.** |
| 3 | `~/.claude/skills/n-order-effects-with-actor-critic.md` | Same context-flag pattern. Replace "hard cap 2 iters (all contexts)" → "unbounded-with-convergence for design-phase; cap=2 for advisory-ask". Per audit § 4. |
| 4 | `~/.claude/skills/actor-critic-workflow.md` | Same context-flag pattern. Replace "hard cap 3 rounds" → "unbounded-with-convergence for design-phase via MCP `convergence_rule`; cap=3 for advisory-ask". Per audit § 5. |
| 5 | `~/.claude/skills/n-order-effects.md` | Add a Chain-section note pointing to the post-trace meta-check loop pattern (chain-level, not skill-level). Per audit § 3. |
| 6 | `~/.claude/skills/critical-perspectives.md` | Add post-synthesis meta-check loop in Chain section. Per audit § 8. |
| 7 | `~/.claude/skills/loop-engineering.md` | Add impl-phase vs design-phase classification note (this skill stays impl-phase by design). Per audit § 9. |
| 8 | `~/.claude/skills/loop-audit-fix.md` | Add impl-phase vs design-phase classification note (this skill stays impl-phase by design). Per audit § 10. |
| 9 | `~/.claude/skills/reference-library.md` | Update canonical chain order to the hybrid co-fire pattern: `meta-thinking → [n-order ⇄ meta-audit] → [actor-critic ⇄ meta-audit] → [n-order-AC ⇄ meta-audit] → [adversarial ⇄ meta-audit] → critical-perspectives → critical-thinking-rigor → meta-thinking-audit-final`. Per audit § "Part 3 — Chain ordering recommendation" Option (c). |
| 10 | `~/.claude/projects/-home-tessara/memory/MEMORY.md` OR project-level MEMORY | Add entry: "loop-convergence Mode declaration landed YYYY-MM-DD; design-phase mode unblocks Wave 0 unbounded meta-check chains." |

**Items 1-4 are the core load-bearing set.** Items 5-8 are documentation/clarification updates that don't change behavior. Items 9-10 are discoverability + memory. Item 11 (not in this list) would be a Wave 0b Phase 3 + Wave 0c re-read to confirm their loop declarations now use the new Mode flag.

---

## Unified diff (copy-paste ready)

```diff
--- a/home/tessara/.claude/skills/loop-convergence.md
+++ b/home/tessara/.claude/skills/loop-convergence.md
@@ -55,12 +55,23 @@
   - Custom: set explicitly in iter 0 declaration; revisit if metric proves noisier than expected.

-- **Threshold declaration** — single line in `loop-log.md` header before iter 1:
+- **Threshold declaration** — single block in `loop-log.md` header before iter 1:
   ```
   ## Convergence criteria
+  Mode: impl-phase | design-phase    ← REQUIRED; defaults to impl-phase if omitted
   Metric: <metric name + how it's measured>
   Threshold: <value at which loop terminates clean>
-  Max iterations: <hard cap>
-  Plateau ε: <delta below which 3 iterations = plateau>
+  Max iterations: <hard cap>          ← REQUIRED for impl-phase; OMIT for design-phase
+  Plateau ε: <delta below which N iterations = plateau>
+  Cycle-detection: <fingerprint scheme>      ← REQUIRED for design-phase; optional for impl-phase
+  Stuck-detection: <fingerprint + N consecutive iters>  ← REQUIRED for design-phase; optional for impl-phase
   ```
+
+  **Mode semantics:**
+  - `impl-phase` (default) — each iteration produces real code/refactor/polish work (LOC scale, 10-50K tokens). Numeric `Max iterations` REQUIRED; cost discipline applies (kernel §1.10). All existing loops without an explicit mode declaration are impl-phase.
+  - `design-phase` — each iteration produces design artifacts (meta-check verdicts, n-order traces, architecture candidates) at 1-3 LLM calls / 5-15K tokens. `Max iterations` OMITTED; termination is convergence-only via threshold-hit + plateau-of-zero + cycle-detected + stuck-on-finding rails. Use when downstream cost of premature termination (defect propagating to impl-phase) dwarfs per-iter cost.
+
+  **Rule of thumb for declaring design-phase:** the loop produces design artifacts (not code), AND a wrong-converged loop costs ≥10× more downstream than an extra iteration costs now.

@@ -88,11 +99,19 @@
    Threshold must be: observable, deterministic (or robust-to-noise via ε), achievable in principle.

-3. **Define the max-iterations cap.** When to abandon. Examples:
+3. **Define the max-iterations cap (impl-phase) OR cycle/stuck-detection rails (design-phase).**
+
+   **If `Mode: impl-phase`:** define `Max iterations` — when to abandon. Examples:
    - 10 iterations for engineering loops (budget protection).
    - 5 iterations for audit-fix loops (more = the audit is wrong, not the fixes).
    - User-specified for custom loops.
-   Required — no max-cap means a stuck loop runs forever.
+   Required — no max-cap on an impl-phase loop means a stuck loop runs forever.
+
+   **If `Mode: design-phase`:** OMIT `Max iterations` and define BOTH rails instead:
+   - **Plateau-of-zero rule:** the audit/meta-check returns 0 findings for N=2 consecutive iterations → clean exit (the design has converged; no further gaps surface).
+   - **Cycle-detection:** define a candidate/finding fingerprint scheme (e.g. structural hash of the proposed frame, the n-order chain's terminal nodes, the actor-critic winner). If the same fingerprint appears in a later iteration after passing once → cycle exit; the design space has been re-explored.
+   - **Stuck-on-finding escalation:** same finding (structural fingerprint) appears N=3+ consecutive iterations *without* the design/candidate changing → escalate to user (the LLM cannot fix this gap; surfacing it as a known limitation is the correct termination).
+   Required — no cycle/stuck-detection on a design-phase loop means an ill-posed loop runs until session compaction.

@@ -105,9 +124,16 @@
    ```

 6. **Stop verdicts (evaluated in this order each iteration):**
+
+   **All modes:**
    - **threshold-hit** — metric ≥ threshold (or ≤ for minimization metrics). Clean exit.
-   - **max-iterations** — iter count ≥ cap. Abandonment exit.
-   - **plateau** — 3-iteration plateau detected. Surface exit.
+   - **plateau** — N-iteration plateau detected (default N=3 with |delta| < ε; design-phase plateau-of-zero is N=2 with finding count = 0). Surface or clean exit per mode.
+
+   **Impl-phase only:**
+   - **max-iterations** — iter count ≥ cap. Abandonment exit. Surface to user with trajectory.
+
+   **Design-phase only:**
+   - **cycle-detected** — candidate/finding/frame fingerprint matches a prior iteration's. Clean exit; flag in verdict so the user can confirm the design space was actually exhausted vs. agent re-proposing the same thing.
+   - **stuck-on-finding** — same finding fingerprint appears N=3+ consecutive iters without design change. Escalation exit; surface to user with the stuck finding as a known limitation.
+
    - **none** — continue to next iteration.

@@ -145,7 +171,10 @@
 - **No metric → no convergence possible.** HARD VIOLATION. Must declare before iter 1.
 - **No threshold → loop runs to max-iter every time.** HARD VIOLATION. Define what "done" looks like.
-- **No max-iter → infinite loop possible.** HARD VIOLATION. Always cap.
+- **No max-iter on an impl-phase loop → infinite loop possible.** HARD VIOLATION. Impl-phase always caps.
+- **Numeric max-iter on a design-phase loop → premature termination.** SOFT VIOLATION (cost-tunable case-by-case, but default is convergence-only — see Wave 0 v1.1 design + founder direction 2026-06-01).
+- **Design-phase loop without cycle-detection AND stuck-detection.** HARD VIOLATION. The two rails together REPLACE the impl-phase max-iter requirement; missing either means the loop has no natural-termination floor and can burn the full session budget on an unfixable finding.
+- **Omitted Mode declaration.** SOFT VIOLATION — defaults to impl-phase for backward compatibility, but every new loop SHOULD declare the mode explicitly.
 - **"Should be converged" without showing trajectory.** Completion theater per kernel §5. Show the trajectory table.
```

---

*End of proposal. To apply: review → approve → run `Edit` against `~/.claude/skills/loop-convergence.md` with the four section replacements above → walk the adoption checklist top-to-bottom → confirm Wave 0b Phase 3 + Wave 0c can now declare `Mode: design-phase` in their loop headers.*
