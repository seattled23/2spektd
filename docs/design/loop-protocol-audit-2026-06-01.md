# Loop-Protocol Audit — 2026-06-01

**Purpose:** founder-direction (2026-06-01) is "for spec 2, the meta think check should be unlimited ... let it loop until it finishes. same with the n order effects — and run a meta check after each n order loop as well." This audit asks: does the same principle apply to the 11 kernel-skill files that define ODIN's looping protocols? Where do hard iteration caps exist? Where should they be replaced with convergence-based termination + stuck-detection? Where (impl-phase, cost-bounded) is a numeric cap genuinely the right move?

**Scope of this doc:** PROPOSAL only. Kernel skill files at `~/.claude/skills/*.md` are NOT edited here. David must approve each proposed change before it lands. Each skill gets a per-section verdict (ACCEPT / REJECT / MIXED) + numeric specifics (current cap → proposed cap).

**Source design constraint:** the Wave 0 design doc (`wave-0-planning.md` v1.1) applied this principle to Wave 0b Phase 3 + Wave 0c. This audit extends the principle outward to global thinking-chain and loop skills.

---

## 0. Framing — design-phase vs impl-phase loops

The founder's direction is correct for **design-phase loops** (loops that produce a *plan* or a *design artifact*). It is NOT correct for **impl-phase loops** (loops that produce *paid LLM calls per iteration on code-generation tasks*). The distinction:

| Loop class | Example | Cost-per-iter | Right termination |
|---|---|---|---|
| **Design-phase** | Wave 0b Phase 3 (n-order + meta-check); Wave 0c (pareto); meta-thinking; n-order-effects; actor-critic-workflow on design choices | Small (1-3 LLM calls); design defects propagate downstream at 30-40× cost | **Convergence-based unbounded** + stuck-detection rail |
| **Impl-phase** | Wave 6.0 codegen regen-on-validator-failure; loop-engineering on N pages of polish; loop-audit-fix on P0/P1 backlog | Large (5-20K tokens/iter; component-LOC scale); each iter generates real code | **Numeric cap + plateau + threshold** |
| **Mixed** | adversarial-thinking solo red-team; critical-thinking-rigor audit | Bounded by surface size (5-lens × 3-vector = 15 per pass); cheap per-vector | **Surface-driven (enumerate fully)** + escalate-on-saturation |
| **Pure-pattern (no iter)** | git workflow; surgical editing | None | N/A |

**The audit rule:** if a skill's cap is on a *design-phase* loop, replace with convergence-based termination + stuck-detection. If a skill's cap is on an *impl-phase* loop, keep it (cost discipline is correct). If a skill has no cap, confirm whether it implicitly needs one (open-ended generation can hide unbounded recursion).

---

## 1. `~/.claude/skills/meta-thinking.md`

### Current state

- **Numeric cap:** NONE in this skill directly. The skill is a chain-opener procedure (Steps 1-6), each step is finite.
- **Step 5 "Lock in the chosen frame":** terminal step, no loop.
- **Implicit cap:** "List 3-5 plausible alternative frames" — `3-5` is a soft enumeration target, not a loop cap.
- **Anti-pattern guard:** the `Frame-shopping` anti-pattern explicitly handles the "5 frames all justify the same prior conclusion" case → escalates to `actor-critic-thinking`. No infinite-loop surface.

### Verdict: **ACCEPT (no change needed)**

This skill is already convergence-shaped: it terminates when one frame is locked-in with discarded frames documented. No iteration cap to remove. The chain-out to `meta-thinking-audit` is a one-shot handoff, not a loop.

### Proposed revision

NONE. Skill is correctly bounded by structural completion (frame locked + alternatives documented), not by iter count.

### Rationale

Frame selection is a single deliberation, not an iterative refinement. The right termination is "we picked one frame with audit trail," which the skill enforces. Adding an iteration cap would be solving a problem that doesn't exist.

---

## 2. `~/.claude/skills/meta-thinking-audit.md`

### Current state

- **Numeric cap (HARD):** `**Infinite-audit loop**: re-running the chain more than once on meta-audit verdict. Hard cap: one RE-RUN; second audit failure means ESCALATE (the question is genuinely ambiguous, surface to user — same hard cap as §1.5 persona loop).` (Anti-patterns section, line ~89.)
- **Same cap referenced in Procedure step 6:** "RE-RUN under `<frame>` — a discarded or missed frame is materially better; re-run chain from `n-order-effects` (frame is locked, no need to re-do `meta-thinking`)." The hard cap is the kernel §1.5 persona-loop ceiling.
- **Loop body cost:** moderate — RE-RUN means re-firing the whole chain from `n-order-effects` onward. Adversarial RE-RUN is 10-30 LLM calls.

### Verdict: **MIXED → MOSTLY-ACCEPT (cap should be removed for design-phase use, kept for advisory-ask use)**

This is the most load-bearing case for the audit. The skill is dual-purpose:

1. **Design-phase use (Wave 0, system architecture decisions):** the founder direction is "let it loop until it finishes." The hard-cap-1-rerun creates the exact failure mode the founder is targeting — a meta-check that fires once, surfaces an issue, gets fixed, and the chain stops without re-verifying that the fix didn't introduce a NEW meta-gap. Convergence-based termination + stuck-detection is correct here.

2. **Advisory-ask use (kernel §1.5 persona-loop, "what should I do about X" questions):** the original cap rationale stands. The persona-loop's hard cap of 2 iterations exists because advisory-asks have *time* as a constraint (founder is waiting). Unbounded meta-audit on a "should I take this deal" question creates analysis paralysis.

### Proposed revision

Split the skill OR add a context-flag:

**Option A (preferred): Add context-flag.** Procedure step 6 becomes:
```
6. **Render VERDICT.** One of:
   - PROCEED — frame held up, conclusion stands, execute.
   - RE-RUN under <frame> — a discarded or missed frame is materially better; re-run chain from n-order-effects.
   - ESCALATE — two frames remain credibly tied; surface both framings + their conclusions to user per §1.5 ASK gate.

**Re-run termination:**
- If chain-in came from a design-phase loop (Wave 0, system-arch decision): re-run is **unbounded with convergence**. Terminate on:
  - Plateau-of-zero: meta-audit returns ZERO findings two consecutive iterations.
  - Cycle-detected: chain re-converges on a frame that already passed a prior meta-audit in this run.
  - Stuck-detection: same finding (structural fingerprint) appears 3+ consecutive iterations without the frame/design changing → escalate.
- If chain-in came from an advisory-ask (kernel §1.5 persona-loop): hard cap 1 re-run, then escalate. (Status quo preserved for time-bounded advisory.)
```

**Numeric:** `current: hard cap 1 re-run (all contexts) → proposed: unbounded-with-convergence for design-phase; cap=1 for advisory-ask`.

### Rationale

The skill's cap was set for the founder-asking-Claude use case, not the orchestrator-running-design-loop use case. Wave 0 needs the latter. Splitting by context preserves both correctly.

---

## 3. `~/.claude/skills/n-order-effects.md`

### Current state

- **Numeric cap:** NONE explicit. The skill traces orders 1→N with `nextThoughtNeeded: true` until "5th order or until the chain hits an obvious terminator." Confidence floor (~0.2) is the natural stop.
- **Anti-pattern guard:** `Padding the chain past the epistemic terminator` — explicitly forbids fabricating Order 6+ for completeness.
- **Loop semantics:** there's no loop here — this is a *single forward trace*, not an iterative refinement. The skill produces ONE chain per ONE proposed action.

### Verdict: **ACCEPT (no cap to remove)**

The skill is correctly shaped as a forward trace with epistemic termination. The founder direction "let n-order-effects loop until it finishes" applies to *re-firing* n-order after a meta-check surfaces gaps (which the Wave 0 design doc handles in §2.4, and the n-order-effects-with-actor-critic skill handles via §1.5 personality-loop). Not to the single-trace skill itself.

### Proposed revision

**Add a "chain-with-meta-check" note** at the end of the Chain section pointing to the post-n-order meta-check protocol from Wave 0 §2.4. This makes the founder direction discoverable from the n-order skill itself:

```
### Post-trace meta-check (founder-direction 2026-06-01)

After every n-order trace in a design-phase context (system-architecture decision, infrastructure choice, anything that consumes the trace for downstream design), invoke `meta-thinking-audit` scoped to "did the n-order projection miss a dimension, a stakeholder, a time horizon, or a 2nd-order effect?" If meta finds gaps → re-fire n-order with the gap as input. Loop until meta returns zero gaps OR cycle detected OR stuck-detection (3+ consecutive same-fingerprint findings).

This is a procedural addition, not a numeric cap change. The single-trace skill itself remains unchanged; the chain that consumes it gains a meta-check loop.
```

**Numeric:** `current: no cap (single-trace skill) → proposed: no cap (unchanged); add meta-check loop at chain level`.

### Rationale

The skill is correctly single-shot. The looping behavior the founder wants lives at the *chain* level (where n-order + meta-check pair up), not the skill level. Document the pattern in the skill's Chain section so it's discoverable.

---

## 4. `~/.claude/skills/n-order-effects-with-actor-critic.md`

### Current state

- **Numeric cap (HARD):** `**Looping past the 2-iteration cap.** Third iteration = the question is genuinely ambiguous. Escalate to user with both framings; don't loop indefinitely.` (Anti-patterns, line ~172.)
- **Procedure step 6 also references the cap:** `If meta-step surfaces a materially better framing, **loop once** (hard cap: 2 iterations total). Third iteration → escalate to user with the two competing framings.`
- **Loop body cost:** HIGH — each iteration is multi-candidate n-order traces (3 × 5 orders × shannon-thinking per order) + critic synthesis. Adversarial-deep = 50-100K tokens.

### Verdict: **MIXED → SPLIT-BY-CONTEXT**

Same dual-purpose problem as `meta-thinking-audit.md`. This skill is used:

1. **Inside Wave 0c** (system-design decision-machinery) → founder wants unbounded.
2. **Inside §1.5 persona-loop** (advisory asks like "should I take this deal") → original 2-iter cap is right.

### Proposed revision

Add same context-flag pattern. Procedure step 6 becomes:

```
6. **Meta-thinking step.** Did we miss a 4th candidate? Did the critic's "optimal" pass a stress test?

**Loop termination depends on chain-in context:**
- If chain-in came from a design-phase loop (Wave 0c, system-design):
  Loop until ONE of:
    - Meta returns no missing candidate/perspective (plateau-of-zero, 2 consecutive iters).
    - Cycle: critic re-converges on a candidate already-passed in prior iter.
    - Stuck-detection: same blindspot/gap surfaced 3+ consecutive iters without candidate changes → escalate.
  NO numeric iter cap.
- If chain-in came from advisory-ask (§1.5 persona-loop):
  Loop ONCE (hard cap: 2 total iters). Third iter → escalate to user.
```

**Numeric:** `current: hard cap 2 iters (all contexts) → proposed: unbounded-with-convergence for design-phase; cap=2 for advisory-ask`.

### Rationale

This skill is the structural twin of `meta-thinking-audit.md`. Same treatment applies. The Wave 0c worked example in the Wave 0 design doc shows exactly why the cap is wrong for design — a 3rd iteration that surfaces a 4th candidate the critic hadn't proposed is *exactly* the optimization the founder wants. Capping it at 2 throws away the highest-value iteration.

---

## 5. `~/.claude/skills/actor-critic-workflow.md`

### Current state

- **Numeric cap (HARD):** `**Hard cap:** 3 rounds default. The kernel's §1.5 loop cap is 2 iterations; actor-critic gets +1 because the inner mechanism is structurally different (role-separated, not just persona-rotated).` (Procedure step 6, end of Procedure section.)
- **Also: `max_rounds: 3, // hard stop; matches kernel §1.5 2-iteration loop cap +1 for actor-critic specifics`** (Required tools section, MCP invocation example).
- **Anti-pattern:** `**Stopping after 1 round.** The whole point is iteration; one round is just brainstorming + critique, not convergence. If you stop at round 1, you've skipped the value.`
- **Loop body cost:** moderate — each round is actor (3 candidates) + critic (attack all 3) + maybe revise. ~10-15K tokens/round.
- **MCP convergence rule already exists:** `convergence_rule: "single-winner | top-2-with-trade-offs | unresolvable-escalate"` — the MCP supports convergence-based termination, the kernel skill just doesn't use it.

### Verdict: **MIXED → SPLIT-BY-CONTEXT**

Same pattern: design-phase use → unbounded with convergence; advisory-ask use → keep cap.

### Proposed revision

Procedure step 2 + step 6 become:

```
2. **Set termination criteria.** Pick based on chain-in context:
   - Design-phase (Wave 0c, system-arch, infrastructure choice):
     max_rounds = NONE (unbounded). Termination via MCP convergence_rule:
       - "single-winner": critic produces a non-dominated candidate that critic itself rates ≥0.85 on all axes.
       - "stuck-detection": same critique-fingerprint repeats 3+ rounds without actor changing strategy → escalate.
       - "cycle-detected": actor re-proposes a candidate that already passed/failed critic in prior round → escalate.
   - Advisory-ask (kernel §1.5 persona-loop, time-bounded decision):
     max_rounds = 3 default; 5 for high-stakes irreversible; 2 for time-pressured.

6. **Finalize.** ... if `escalate`, the question is genuinely ambiguous — surface the top 2 with trade-offs and let the founder pick. For design-phase chains, ESCALATE only after stuck-detection fires, not after max-rounds.
```

**Numeric:** `current: hard cap 3 rounds → proposed: unbounded-with-convergence for design-phase; cap=3 for advisory-ask`.

### Rationale

The MCP itself already supports convergence-based termination via `convergence_rule`. The kernel skill arbitrarily wraps a numeric cap around it. Removing the wrapper for design-phase use unlocks the MCP's actual termination semantics. Same advisory-ask carve-out as the rest.

---

## 6. `~/.claude/skills/adversarial-thinking.md`

### Current state

- **Numeric cap:** `Required tools` section: `open a sequential-thinking session with **total_thoughts: 15** (3 vectors × 5 lenses). One thought per (lens, vector) pair.` — this is a *fixed enumeration target*, not a loop cap.
- **Escalation rule:** `if you generate >15 distinct vectors and they keep being non-overlapping, the surface is too large for solo — escalate to **adversarial-audit-wave** with the vectors so far as the audit brief.`
- **Loop semantics:** the skill is NOT iterative — it enumerates 5 lenses × 3 vectors in a single pass. There's no loop to remove a cap from.
- **Shannon cutoff (optional):** `Fix anything ≥ P=0.1 × Impact=3 (= 0.3). Below that, log to backlog with diagnosis intact, don't fix in-session.` — this is a fix-vs-defer policy, not a loop cap.

### Verdict: **ACCEPT (no cap to remove)**

This skill is a **surface-driven enumeration**, not an iterative refinement. The 15-vector target is the surface size (5 lenses × 3 vectors), not an iteration budget. Founder's principle ("let it loop until it finishes") doesn't apply — there's no loop here, just a fixed enumeration.

### Proposed revision

NONE. The skill is correctly shaped: enumerate fully, escalate if surface is too large.

**Numeric:** `current: 15-vector enumeration target (no loop) → proposed: 15-vector enumeration target (no loop, unchanged)`.

### Rationale

Adversarial-thinking is fixed-budget per the 5-lens × 3-vector design — that IS the completeness criterion, not a cost cap. Increasing it to 20 or 30 doesn't make the audit better; it just inflates vector-count without surfacing new attack classes. The escalation rule (>15 = audit-wave) already handles "surface is too large for solo" correctly.

---

## 7. `~/.claude/skills/critical-thinking-rigor.md`

### Current state

- **Numeric cap:** NONE. The skill is a chain-walk through inference steps, one thought per inference, terminating when every step has `evidence: <source>` or the claim is refused.
- **Anti-pattern:** `Over-rigor on opinions. Demanding sources for "I think Variant A's tone is warmer" is misapplied — that's a preference, not a ground-truth claim. Reserve rigor for truth-valued claims.` — natural-saturation guard.
- **Escalation:** `actor-critic-thinking` MCP "when sequential-thinking gets stuck in a self-confirming loop (the 'I think this is right because I think it's right' failure)." — has a stuck-detection-like rail already.
- **Loop semantics:** one-shot inference walk per claim. No iteration.

### Verdict: **ACCEPT (no cap to remove)**

This skill is structurally similar to `n-order-effects.md`: a forward walk with natural termination, not an iterative refinement. No cap to remove.

### Proposed revision

NONE. The escalation to actor-critic on self-confirming loops is the right rail; it already prevents indefinite loop on the same claim.

**Numeric:** `current: no cap (one-shot per claim) → proposed: no cap (unchanged)`.

### Rationale

Rigor pass terminates when every inference is sourced or the claim is refused. There's no "iterate to convergence" here — the surface (the inference chain) is finite. No founder-direction conflict.

---

## 8. `~/.claude/skills/critical-perspectives.md`

### Current state

- **Numeric cap (SOFT):** `**Stakeholder inflation.** 7 personas is not "more rigorous" than 3 — it dilutes signal and burns time. Cap at 4-5. Beyond that, return diminishes and you're avoiding the synthesis step.` (Anti-patterns.)
- **Procedure step 2:** `Enumerate **3+ stakeholders by INCENTIVE STRUCTURE**` — soft floor + soft ceiling 4-5.
- **Loop semantics:** ONE persona-pass + ONE critic synthesis = one iteration. No iterative re-fire.
- **Chain-out:** hands off to `critical-thinking-rigor`, which itself doesn't loop.

### Verdict: **ACCEPT (cap is soft + correct)**

The 4-5 persona cap is a *signal-quality* limit (3 incentive-diverse personas + critic = high signal; 7 personas dilutes), not an *iteration* limit. Founder direction doesn't apply to enumeration breadth.

### Proposed revision

NONE for the numeric cap. **Suggested addition:** chain into post-perspective meta-check (per founder-direction pattern). Add to Chain section:

```
### Post-synthesis meta-check (founder-direction 2026-06-01 pattern)

After the critic synthesizes (Procedure step 4-5), invoke `meta-thinking-audit` to ask: "did the persona triple miss an incentive-structure that would have changed the recommendation?" If yes → re-run persona-pass with the missed incentive as a new persona. Loop until meta returns zero missed perspectives OR cycle-detected (same persona-triple proposed) OR stuck-detection (same blindspot 3+ iters).

For advisory-ask context (kernel §1.5 persona-loop), hard cap is 2 iterations (matches §1.5). For design-phase context, unbounded with convergence.
```

**Numeric:** `current: 4-5 persona cap per pass + 1-pass structure → proposed: 4-5 persona cap per pass (unchanged) + post-synthesis meta-check loop (design-phase unbounded, advisory-ask cap=2)`.

### Rationale

The cap is correct (it's a signal-quality limit). What's missing is the post-pass meta-check that catches "we picked the wrong 3 personas." Adding that loop aligns with the founder's "meta after every n-order pass" pattern.

---

## 9. `~/.claude/skills/loop-engineering.md`

### Current state

- **Numeric cap (HARD via loop-convergence nesting):** `### Default convergence criteria via loop-convergence: ... Max iterations: 6 (4 lane-passes + 2 reserve)` (worked example).
- **Anti-pattern:** `**No break criteria → infinite loop.** HARD VIOLATION. loop-convergence is mandatory.`
- **Procedure step 2:** `Set explicit break criteria via loop-convergence: ... pick the metric (coverage %, audit-finding count, lighthouse score, gate-pass rate), the threshold, the max-iterations cap, and the plateau ε. No criteria → STOP, do not start.`
- **Loop body cost:** HIGH — each iter is real code work (refactor, polish, test). 10-50K tokens + actual file edits + gate runs. **This is impl-phase.**

### Verdict: **ACCEPT (cap is correct for impl-phase)**

This skill drives **impl-phase loops** — refactor, polish, hardening passes. Each iter generates real code. Cost discipline is correct here. The founder's design-phase principle does NOT apply.

### Proposed revision

NONE for the numeric cap. **Suggested clarification:** add an explicit note distinguishing impl-phase (this skill) from design-phase loops:

```
### Loop classification (added 2026-06-01)

This skill is for **impl-phase loops** — each iteration produces real code/refactor/polish work at the LOC scale. Numeric max-iterations cap is correct here (kernel §1.10 cost-discipline applies; per-iter cost is real).

For **design-phase loops** (system-architecture decisions, meta-thinking refinement, n-order-effects + meta-check pairs in Wave 0): use convergence-based termination + stuck-detection rail INSTEAD of numeric caps. See `wave-0-planning.md` v1.1 for the reference pattern.
```

**Numeric:** `current: per-loop user-set max-iter (typically 5-10) → proposed: per-loop user-set max-iter (unchanged); add impl-phase/design-phase classification note`.

### Rationale

Per the §0 framing: design-phase loops are unbounded-with-convergence; impl-phase loops are numeric-capped. This skill is the canonical impl-phase loop. Keep the cap. Add a discoverable pointer to the design-phase alternative so an agent reading this doesn't apply impl-phase caps to design-phase loops.

---

## 10. `~/.claude/skills/loop-audit-fix.md`

### Current state

- **Numeric cap (HARD via loop-convergence nesting):** `Max iterations: 5 iterations for audit-fix loops (more = the audit is wrong, not the fixes).` (loop-convergence skill, referenced from here.)
- **Per-finding retry cap:** `Cap: 2 retries per finding — if still failing, escalate (likely wrong agent / wrong scope / wrong root cause; consult kernel §1.7 fix-upstream discipline).`
- **Anti-pattern:** `**No break criteria → infinite loop.** HARD VIOLATION. loop-convergence is mandatory.`
- **Loop body cost:** HIGH — each iter is parallel-fix-agents writing real code + verification agents running tests + re-audit. 30-200K tokens per iter depending on backlog size.

### Verdict: **ACCEPT (cap is correct for impl-phase)**

Same as `loop-engineering.md` — this is impl-phase. Cost discipline is correct. Founder direction doesn't apply.

### Proposed revision

NONE for the numeric cap. **Suggested clarification:** same impl-phase/design-phase classification note as proposed for `loop-engineering.md`.

```
### Loop classification (added 2026-06-01)

This skill is for **impl-phase loops** — each iteration runs fix-agents that produce real code changes + verification-agents that run real tests. Numeric max-iterations cap is correct.

For **design-phase audit loops** (architecture-decision audit, requirements-completeness audit, system-spec audit): use convergence-based termination per `wave-0-planning.md` v1.1 §2.2.6 + §2.3.6 + §2.5.
```

**Numeric:** `current: 5-iter max-iter cap (default) + 2-retry-per-finding cap → proposed: 5-iter + 2-retry caps (unchanged); add classification note`.

### Rationale

Same as §9. Audit-fix on real backlog is impl-phase; cost-bounded iter cap is correct. Audit-fix on an architectural-decision artifact would be design-phase — but this skill doesn't currently support that use case (the audit-fix backlog model assumes findings have line-numbered fixes, which architectural audits don't have). So the cap stays.

---

## 11. `~/.claude/skills/loop-convergence.md`

### Current state

- **Numeric cap (HARD requirement):** `**No max-iter → infinite loop possible.** HARD VIOLATION. Always cap.` (Anti-patterns.)
- **Procedure step 3:** `Define the max-iterations cap. When to abandon. Examples: 10 iterations for engineering loops (budget protection). 5 iterations for audit-fix loops (more = the audit is wrong, not the fixes). User-specified for custom loops. Required — no max-cap means a stuck loop runs forever.`
- **Threshold declaration template:** `Max iterations: <hard cap>` — REQUIRED field.
- **This skill is the SOURCE of the "always have a numeric cap" requirement** that every other loop skill nests.

### Verdict: **MIXED → MODIFY to allow convergence-only termination for design-phase**

This skill is the foundation. If it requires a numeric cap, every nesting skill (loop-engineering, loop-audit-fix, and any future design-phase loop driver) inherits the requirement. Founder direction conflicts with the current "Always cap" anti-pattern.

### Proposed revision

The skill needs to support two modes:

```
## 6. Stop verdicts (evaluated in this order each iteration):

   - **threshold-hit** — metric ≥ threshold (or ≤ for minimization metrics). Clean exit.
   - **max-iterations** (impl-phase only) — iter count ≥ cap. Abandonment exit. **REQUIRED for impl-phase loops; FORBIDDEN as the only termination for design-phase loops.**
   - **plateau** — 3-iteration plateau detected. Surface exit.
   - **cycle-detected** (design-phase) — candidate/finding/frame fingerprint matches a prior iteration's. Clean exit; flag in verdict.
   - **stuck-on-finding** (design-phase) — same finding (structural fingerprint) appears N=3+ consecutive iters without design change. Escalation exit.
   - **none** — continue to next iteration.

### Mode declaration (NEW)

Threshold declaration template adds:
```
## Convergence criteria
Mode: impl-phase | design-phase    ← NEW
Metric: <metric name + how it's measured>
Threshold: <value at which loop terminates clean>
Max iterations: <hard cap>          ← REQUIRED for impl-phase; OMITTED for design-phase
Plateau ε: <delta below which 3 iterations = plateau>
Cycle-detection: <enabled | disabled>     ← REQUIRED for design-phase; optional for impl-phase
Stuck-detection: <fingerprint scheme>     ← REQUIRED for design-phase; optional for impl-phase
```

### Anti-pattern revision

```
- **No max-iter for impl-phase loop → infinite loop possible.** HARD VIOLATION. Impl-phase always caps.
- **Numeric max-iter for design-phase loop → premature termination.** SOFT VIOLATION (cost-tunable case-by-case, but default is convergence-only). See `wave-0-planning.md` v1.1 + founder direction 2026-06-01.
- **Design-phase loop without cycle-detection or stuck-detection.** HARD VIOLATION. Replaces the impl-phase max-iter requirement — design-phase must have the natural-termination rails.
```

**Numeric:** `current: max-iter REQUIRED for all loops → proposed: max-iter REQUIRED for impl-phase, FORBIDDEN-as-only-rail for design-phase (cycle + stuck-detection are the design-phase equivalents)`.

### Rationale

This is the foundational skill that needs the most surgical update. Without it, loop-engineering/loop-audit-fix/Wave-0-loops cannot consistently use convergence-only termination. The mode declaration makes the impl-vs-design distinction explicit in every loop's header.

---

## Summary table — proposed kernel changes (David approves/rejects each)

| # | Skill | Current cap | Proposed cap | Verdict | David's call |
|---|---|---|---|---|---|
| 1 | `meta-thinking.md` | None (one-shot frame selection) | None (unchanged) | **ACCEPT** | ☐ approve ☐ veto |
| 2 | `meta-thinking-audit.md` | Hard cap 1 RE-RUN (all contexts) | Unbounded-with-convergence (design); cap=1 (advisory-ask) | **MIXED** | ☐ approve ☐ veto |
| 3 | `n-order-effects.md` | None (one-shot trace) | None; add post-trace meta-check loop in Chain section | **ACCEPT** + addition | ☐ approve ☐ veto |
| 4 | `n-order-effects-with-actor-critic.md` | Hard cap 2 iters (all contexts) | Unbounded-with-convergence (design); cap=2 (advisory-ask) | **MIXED** | ☐ approve ☐ veto |
| 5 | `actor-critic-workflow.md` | Hard cap 3 rounds | Unbounded-with-convergence (design); cap=3 (advisory-ask) | **MIXED** | ☐ approve ☐ veto |
| 6 | `adversarial-thinking.md` | 15-vector enumeration target (no loop) | Unchanged | **ACCEPT** | ☐ approve ☐ veto |
| 7 | `critical-thinking-rigor.md` | None (one-shot chain walk) | Unchanged | **ACCEPT** | ☐ approve ☐ veto |
| 8 | `critical-perspectives.md` | 4-5 persona cap (signal-quality, not iter) | Unchanged + add post-synthesis meta-check loop | **ACCEPT** + addition | ☐ approve ☐ veto |
| 9 | `loop-engineering.md` | Per-loop max-iter (user-set, impl-phase) | Unchanged; add impl-vs-design classification note | **ACCEPT** + clarification | ☐ approve ☐ veto |
| 10 | `loop-audit-fix.md` | 5-iter max + 2-retry-per-finding | Unchanged; add impl-vs-design classification note | **ACCEPT** + clarification | ☐ approve ☐ veto |
| 11 | `loop-convergence.md` | Max-iter REQUIRED for all loops | Mode declaration: impl-phase requires max-iter; design-phase replaces with cycle+stuck-detection | **MIXED** (foundational change) | ☐ approve ☐ veto |

**Single most important change (David should authorize first):** **#11 `loop-convergence.md`**. It's the foundational skill that every nesting skill inherits requirements from. Without modifying it to support both impl-phase and design-phase modes, none of the other proposed changes are self-consistent (they'd be required to declare a numeric cap by their nested loop-convergence skill, contradicting their design-phase intent).

**Single highest-impact change for Wave 0 specifically:** **#2 `meta-thinking-audit.md`**. The hard-cap-1-rerun is the exact failure mode the Wave 0 design doc had at v1.0. Updating this skill unlocks the founder-direction pattern globally — every chain that uses `meta-thinking-audit` (which is most non-trivial decisions) benefits.

---

## Cost-capping required vs design-phase unbounded — explicit distinction

The founder direction "let it loop until it finishes" applies to **design-phase loops** where:

1. **Per-iter cost is small** (1-3 LLM calls, ~5-15K tokens).
2. **Downstream cost of a wrong-converged loop is large** (Wave 6 codegen regen cascades, system-design defects that propagate through every spec).
3. **Convergence has a natural signal** (meta-check returns zero gaps; pareto frontier stops moving; cycle-detected).
4. **Stuck-detection is a viable rail** (the LLM either fixes the gap or surfaces it as a known limitation; either way, the loop terminates without numeric cap).

The founder direction does NOT apply to **impl-phase loops** where:

1. **Per-iter cost is large** (10-50K tokens of real code generation; component-LOC scale work).
2. **Each iter compounds risk** (a wrong refactor at iter 3 contaminates iter 4-10; an unsafe migration at iter 5 propagates downstream).
3. **Convergence may not exist** (the wrong agent class is being used; the wrong architecture is being patched; the wrong test is being written).
4. **Cost-discipline is the founder's other directive** (kernel §1.10 — pre-revenue, every infrastructure hour is justified against time-to-first-revenue).

Wave 6.0 codegen regen, loop-engineering, and loop-audit-fix are the canonical impl-phase loops. Numeric caps stay there. Wave 0b Phase 3, Wave 0c, and any future design-phase chain that uses meta-thinking-audit / n-order-effects-with-actor-critic / actor-critic-workflow on design artifacts are design-phase. Convergence-based unbounded with stuck-detection is the right pattern.

**The kernel §1.10 cost-discipline concern is real for both.** The way it's preserved for design-phase loops:
- Cost-soft-warning at threshold (per Wave 0 §3.4) makes adversarial-deep loops *visible* to the user, who can intervene.
- Stuck-detection (per Wave 0 §2.5) makes ill-posed loops *terminate* without burning the full budget on a finding the LLM can't fix.
- Cycle-detection guarantees that a loop exploring a finite design surface terminates when the surface is exhausted.

In aggregate, design-phase unbounded-with-convergence is **softer-bounded** than impl-phase numeric caps, but it's still bounded — just by natural termination rails instead of arbitrary numerics.

---

## Part 3 — Chain ordering recommendation

The canonical chain order is currently:

> meta-thinking → n-order-effects → actor-critic-workflow → n-order-effects-with-actor-critic → adversarial-thinking → critical-perspectives → critical-thinking-rigor → meta-thinking-audit

**Question:** given the founder's direction "run a meta check after each n order loop as well," should this chain order be restructured?

**Options evaluated:**

### (a) Status quo with inner-loops

Outer chain stays linear; each phase that uses n-order or actor-critic embeds inner meta-check loops. Minimal surface-area change.

- **Pros:** Skills file footprint unchanged; existing chain documentation works; meta-check loops are encapsulated inside the skill that uses them.
- **Cons:** The post-pass meta-check is implicit — readers of the chain doc don't see it; only readers of each skill's procedure see it.
- **First-order:** clear; no chain doc rewrite.
- **Second-order:** agents reading the kernel chain order won't know about the embedded meta-checks unless they read each skill's procedure section. Drift risk.
- **Third-order:** as the kernel evolves, future skills may not embed meta-checks because the chain-doc didn't surface the pattern. Quality decay.

### (b) Restructured chain with explicit meta-checkpoints

Insert `meta-thinking-audit` after EVERY major phase, not just at the end. Chain becomes:

> meta-thinking → [n-order-effects → meta-check] → [actor-critic-workflow → meta-check] → [n-order-effects-with-actor-critic → meta-check] → [adversarial-thinking → meta-check] → critical-perspectives → critical-thinking-rigor → meta-thinking-audit-final

- **Pros:** Maximally explicit; every pass is verified by meta-check; the founder direction is structurally encoded in the chain order itself.
- **Cons:** Chain length doubles; token overhead non-trivial (every meta-check is 1-3 LLM calls); over-applies meta-check to phases where it's not needed (e.g. critical-thinking-rigor is already a rigor-audit, double-auditing is pure overhead).
- **First-order:** verbose chain; high quality floor.
- **Second-order:** agents start skipping meta-checks because the chain is too long; quality decay through shortcutting.
- **Third-order:** meta-check inflation devalues the meta-check itself — when everything has a meta-check, no meta-check signals anything special.

### (c) Hybrid — pair-wise co-fire requirement

Keep outer chain linear but mark certain pairs (n-order + meta, actor-critic + meta, adversarial + meta) as "always co-fire." N-order without immediate meta-check is FORBIDDEN. The chain doc names the pairs explicitly. Other phases (critical-perspectives, critical-thinking-rigor) don't get a co-fire requirement because they're already audit-shaped or stakeholder-shaped and meta-check would be redundant.

- **Pros:** Founder direction structurally encoded for the phases that *generate hypotheses* (n-order, actor-critic, adversarial) without inflating phases that *audit hypotheses* (rigor, perspectives). Selective application = strong signal preserved.
- **Cons:** Slight kernel doc complexity ("which pairs co-fire?"); requires the chain doc to call out the pairs.
- **First-order:** moderate chain length; clear which phases require meta-check.
- **Second-order:** agents reading the chain see "n-order + meta-check" as a unit; can't easily skip the meta-check without violating the pair.
- **Third-order:** meta-check retains discriminative value (only applied where it adds signal); kernel chain stays maintainable.

### Recommendation: **(c) Hybrid**

**Justification (first-sentence load-bearing):** option (c) structurally encodes the founder's direction for the phases that benefit ("after each n-order loop" + actor-critic + adversarial — all hypothesis-generating phases) while keeping meta-check signal-strong by NOT applying it to phases that are already audit-shaped (critical-perspectives is stakeholder-audit; critical-thinking-rigor is reasoning-audit — meta-checking an audit produces compound-audit fatigue without signal lift).

**Second sentence:** option (b)'s "meta-check after everything" inflates the chain and devalues meta-check; option (a)'s "implicit inner-loop" leaves the pattern undiscoverable from the chain doc. Hybrid balances explicitness with selective application.

**Proposed updated chain order:**

> meta-thinking → **[n-order-effects ⇄ meta-thinking-audit]** → **[actor-critic-workflow ⇄ meta-thinking-audit]** → **[n-order-effects-with-actor-critic ⇄ meta-thinking-audit]** → **[adversarial-thinking ⇄ meta-thinking-audit]** → critical-perspectives → critical-thinking-rigor → meta-thinking-audit-final

Where `⇄` denotes "co-fire pair — first phase produces, second phase audits, loop if audit surfaces gaps until convergence." Four co-fire pairs in the middle, three solo phases at the start and end.

**Implementation note:** the `⇄` pair semantics matches the v1.1 Wave 0 design exactly (post-n-order meta-check in §2.4; meta-audit on actor-critic + adversarial follows the same pattern). The kernel chain order becomes the discoverable pointer to the v1.1 Wave-0 pattern; new agents following the chain inherit the founder-direction by default.

---

## Cross-references

- Wave 0 design v1.1: `/home/tessara/companyos/system/spec2/docs/design/wave-0-planning.md` — applies the same principle to Wave 0b Phase 3 + Wave 0c.
- Kernel §1.5 persona-loop (advisory-ask 2-iter cap): the dual-context case for many of the MIXED-verdict skills.
- Kernel §1.10 revenue-priority: justifies why design-phase cost is bounded by *downstream impact* (Wave 6 regen cost > Wave 0 design cost) not by *per-iteration cost*.
- Kernel §4 orchestration: parallel sub-agent worktrees for impl-phase loops (loop-engineering, loop-audit-fix) — design-phase loops are usually single-agent sequential, so worktree isolation is less relevant.

---

*End of audit. David: approve/veto per row in the summary table. Highest-impact single change to authorize first is #11 (loop-convergence mode-declaration); highest-impact change for Wave 0 specifically is #2 (meta-thinking-audit context-flag).*
