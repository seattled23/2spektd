# Wave 0 — Pre-Wave-1 Planning Stages

**Version:** v1.1 — 2026-06-01 founder-direction loop-unbinding revision
**Status:** Paper design, awaiting review.
**Owner:** David (review/approve/reject).
**Author session:** 2026-06-01.
**Supersedes:** nothing yet — this defines a new wave family. References ROADMAP §1, §11, §11.6 as binding constraints; ROADMAP itself is unchanged by this doc.
**Implementation target:** v1.5.0-dev (post v1.4.0; see §5 phasing).
**Not in scope of this doc:** code, validators, prompts in their final form. This is a contract for what gets built.

### Changelog

- **v1.1 (2026-06-01):** Founder-direction revision unbinding design-phase quality loops.
  - §2.2.6 + §2.2.4 Phase 3: meta-thinking restart cap REMOVED; replaced with convergence-based termination (zero-gap plateau, cycle detection, structural-fingerprint stuck-detection).
  - §2.3.5 + §2.3.6: Wave 0c MAX_ITER cap REMOVED for the design-phase pareto loop; replaced with convergence-based termination (frontier plateau, threshold-hit, stuck-detection). Cost-cap retained as a separate soft-warning, not a hard stop.
  - NEW §2.4: post-n-order meta-check protocol. Every n-order pass in Wave 0b Phase 3 and Wave 0c is followed by a meta-thinking audit; gaps surfaced re-enter the loop with the gap as input.
  - NEW §2.5: stuck-detection safety rail. Same finding by structural fingerprint for N=3+ consecutive iterations without design change → escalate to user with failure mode flagged. Prevents LLM loop-spin on un-fixable findings.
  - §7.5 Open Decision 4 (wave0Interactive) preserved — still requires David's call.
- **v1.0 (2026-06-01):** Initial design.

---

## 0. Reading guide

This doc has six required sections (a–f from the brief) plus a §0 framing and §7 open questions / decisions David must own. Each numbered section is self-contained but references peers. Read order for review:

1. §1 — what problem Wave 0 solves and what would be wrong with skipping it. Read this if you only have 5 minutes.
2. §2 — the three David-requested stages (0a, 0b, 0c) in spec form.
3. §3 — gap analysis: which other planning stages are missing, and which ones are MUST-HAVE vs NICE-TO-HAVE vs OUT-OF-SCOPE. Yields the final Wave 0 stage list.
4. §4 — integration with existing pipeline (orchestrate.ts dispatch, checkpointing, registry, artifact flow into Wave 1).
5. §5 — token-cost analysis.
6. §6 — three-tool integration contract (planning MCP write-back).
7. §7 — constraint compatibility (§1.1 isolation, §1.3 post-generation alignment) + open decisions.

---

## 1. Framing — why Wave 0 must exist

### 1.1 The shaped gap

Wave 1 today receives `requirements: string` (a free-form prompt) and immediately produces a system spec. Three classes of decision are silently made by the LLM at that boundary:

1. **What language(s) the system should be written in.** Currently passed by the caller as `language: string`. Caller may not know.
2. **What architecture style fits the requirements.** Currently implicit in Wave 1's "Major Subsystems" output. The LLM picks one without surfacing alternatives or trade-offs. Once picked, all six waves downstream are locked into it.
3. **What gaps the requirements themselves have.** Wave 1 generates *as if* the requirements are complete. Underspecified NFRs, missing constraints, unstated regulatory obligations, no observability target — none of this surfaces until Wave 6 (or production).

These are **upstream** decisions in the §1.7 sense. Patching them in Wave 6 is symptom-patching. The whole point of §11's quality sub-waves is to push correctness as early as possible; Wave 0 pushes architectural correctness earlier still.

### 1.2 Why the LLM picking silently is dangerous

The §1.3 wave-alignment-is-post-generation invariant exists because exposing siblings during generation contaminates design reasoning. The same principle inverted: exposing *no candidates at all* during generation forces the LLM to pick one silently — and that pick is exactly the kind of decision that should be surfaced, audited, and held to a pareto-frontier test. Wave 0 fills the gap *before* Wave 1 starts; once Wave 1 begins, Wave 0's outputs are read-only inputs (same shape as `SYSTEM CONTEXT` is for downstream waves).

### 1.3 Frame selection (meta-thinking applied to Wave 0 itself)

Applying `~/.claude/skills/meta-thinking.md` to "why design Wave 0":

- **FRAME-SELECTED:** *upstream-defect-prevention* — Wave 0 catches design defects before they cost six waves of regeneration.
- **JUSTIFICATION:** Dominant failure mode is "Wave 6 produces wrong-shape code because Wave 1 silently picked the wrong architecture." Patching at Wave 6 costs ~30-40× the tokens of patching at Wave 1 input.
- **DISCARDED:**
  - *cost-minimization* (would skip Wave 0 entirely — wrong because Wave 6 regeneration is the actual cost driver).
  - *feature-completeness* (would build all 12 candidate stages from §3 — wrong because the founder is pre-revenue and over-engineering Wave 0 is the §1.10 trap).
  - *parity-with-prior-art* (Goodvibes had review agents at this slot; OpenSpec didn't — wrong because lineage is not architecture, and the §10 review agents are already scheduled for v1.3.x).
- **DOWNSTREAM-IMPLICATION:** Every Wave 0 stage must justify itself against "would this defect have been catchable later, and how much cheaper?" If the answer is "catchable in Wave 1 validator", drop the stage. If the answer is "only catchable at runtime", include it.

This is the frame this doc operates under. It's the same frame David's "pareto-frontier-clean" termination criterion implies: Wave 0c's job is to ensure no architectural defect *we can find* survives into Wave 1.

---

## 2. The three David-requested stages

### 2.0 Naming and ordering

Wave 0 has three substages in strict sequential order: **0a → 0b → 0c**. Reason: 0b consumes 0a's language choice (architecture differs by language — Go favors flat composition, Python favors class hierarchies, Rust favors trait-based polymorphism); 0c consumes 0b's architecture (you cannot pareto-optimize an architecture you don't have yet). Parallelism is not safe here. Inside 0c, the actor-critic loop runs many iterations; that's internal parallelism.

After §3's gap analysis, additional stages may slot in **before 0a** (requirements clarification, constraint elicitation) or **between 0a/0b** (hardware-target characterization). See §3 for final ordering.

### 2.1 Wave 0a — Optimal language selection

#### 2.1.1 Purpose

Given the requirements, pick the best language(s) for the project. Today `language` is a caller arg; Wave 0a removes that contract: the orchestrator receives requirements + (optional) hard-pinned language; if no pin, Wave 0a produces a ranked recommendation with rationale and asks for confirmation. If a pin is set, Wave 0a still runs but produces a *sanity-check* output ("the pinned language is the right choice because X" or "the pinned language is suboptimal because Y; override?").

#### 2.1.2 Inputs

- `requirements: string` (the free-form prompt — same as Wave 1 input today)
- `languagePin?: string` (optional caller-supplied hard pin; default unset)
- `availablePacks: LanguagePack[]` (read from `skills/spec2/packs/index.ts` — only packs with shipped detectors qualify as "first-class")
- `hardwareTarget?: HardwareTarget` (from Wave 0a₂ if §3 promotes it; otherwise null and Wave 0a uses a default deployment-agnostic profile)

#### 2.1.3 Outputs

- **`.spec2/wave-0/language-selection.json`** (machine-readable, the source the orchestrator reads when constructing `ctx.language`):
  ```jsonc
  {
    "primary": "go",
    "secondary": null,             // null OR a second language for FFI/polyglot setups
    "rationale": "<≤500 chars>",
    "rejected_candidates": [
      { "lang": "rust", "reason": "<≤200 chars>", "score_delta": -0.18 }
    ],
    "axes_scored": {
      "runtime_fit": 0.92,
      "ecosystem_maturity": 0.85,
      "deployment_target_fit": 0.88,
      "pack_support_score": 1.0,   // first-class pack = 1.0, partial = 0.5, none = 0.0
      "future_portability": 0.7,
      "ffi_needs_match": 1.0,
      "license_compatibility": 1.0
    },
    "pin_status": "unpinned" | "pinned-confirmed" | "pinned-overridden-by-user" | "pinned-flagged-suboptimal",
    "generated_at": "<ISO8601>",
    "wave_0a_version": "1.0"
  }
  ```
- **`.spec2/wave-0/language-selection.md`** (human-facing — markdown rationale; consumed by the review package and by David)

#### 2.1.4 Algorithm (logic sketch — not code)

1. **Enumerate candidates.** Start with every first-class pack in `packs/index.ts`. If a pack is partial (detector stub), it qualifies only if no first-class pack scores higher; partials get a score penalty (×0.5 on `pack_support_score`).
2. **Score each candidate on 7 axes** (see `axes_scored` above). Each axis is a 0–1 score with an explicit definition:
   - `runtime_fit`: does the runtime suit the problem class? (latency-sensitive → Go/Rust > Python; ML inference → Python > Go; embedded → Rust/C > Python.)
   - `ecosystem_maturity`: are there well-maintained libraries for the problem's dominant subdomain? (HTTP servers everywhere; ML in Python; cryptographic primitives in Rust/Go.)
   - `deployment_target_fit`: does the language deploy cleanly to the hardware target (see Wave 0a₂)?
   - `pack_support_score`: do we have a shipped LanguagePack for it? Drives §11 quality enforcement.
   - `future_portability`: how locked-in is the choice? (Go = portable; CUDA-Python = not portable.)
   - `ffi_needs_match`: if the requirements imply calling into existing C/C++/Python libraries, does this language do FFI cleanly?
   - `license_compatibility`: does the language's stdlib + dominant package ecosystem licenses match what the requirements imply (e.g. AGPL is fine for SaaS, not for embedded ship-and-forget).
3. **Compute composite score** = weighted average. Default weights: `[0.20, 0.20, 0.15, 0.20, 0.10, 0.10, 0.05]` (sums to 1.0). Weights are tunable per project via `.spec2/wave-0/weights.json` — defaults written if absent.
4. **Rank candidates.** Top candidate becomes `primary`. If gap to #2 is <0.05 AND #2's pack support is also first-class, surface as a "near-tie" in the rationale — David's review can flip it.
5. **FFI / polyglot detection.** If the requirements explicitly mention "must call existing Python ML model" or "must integrate with existing Rust crate," set `secondary` and require both languages have first-class packs. If `secondary != null`, downstream waves see *two* languages and Wave 6 must emit two files per component (one per language) — this is a substantial change to existing Wave 6 contract, so the default behavior is `secondary = null` and polyglot is a flagged opt-in (see §7 Open Decision 3).
6. **Pin handling.** If `languagePin` is set: still run the scoring. If the pin scores within 0.05 of the top candidate, mark `pinned-confirmed`. If it scores worse by ≥0.05, mark `pinned-flagged-suboptimal` and emit a markdown patch proposal — David sees both choices and decides.

#### 2.1.5 Tooling

- **LLM call shape:** ONE prompt to the LLM (same provider chain as existing waves — Groq → OpenRouter → Anthropic). Prompt structure: `[REQUIREMENTS]` + `[AVAILABLE_PACKS_WITH_SCORES_HINT]` + `[AXES_DEFINITION]` + `[FORMAT_INSTRUCTIONS_FOR_JSON_OUTPUT]`. Estimated 1,200-1,800 input tokens, 600-1,000 output tokens.
- **Deterministic axes are NOT LLM-decided:** `pack_support_score` and `license_compatibility` are computed from `packs/index.ts` and a per-language license table the orchestrator owns. The LLM scores the other 5 axes. This split prevents the LLM from "feeling" a pack is first-class when it isn't.
- **Validator:** same shape as existing tier validators (`skills/spec2/validators/wave-0a-validator.ts` — paper-spec only at this stage). Checks: (a) all 7 axes scored 0-1, (b) primary candidate exists in `packs/index.ts`, (c) rationale is non-empty and ≥100 chars, (d) JSON parses.

#### 2.1.6 Termination conditions

- **Success:** validator passes, JSON+MD artifacts written, checkpoint saved. → Wave 0b runs.
- **Failure modes:**
  - LLM output unparseable → regenerate with same prompt + parse-error context. Max 3 attempts (same as existing `MAX_REGENERATION_ATTEMPTS = 5` in orchestrate.ts:55? — actually 3, see orchestrate.ts:55).
  - Validator fails → regenerate with itemized issues (same pattern as Wave 1, see orchestrate.ts:241-308).
  - 3 attempts exhausted → throw, surface to user, abandon build. Same failure-handling shape as Wave 1.
  - Pin flagged suboptimal → NOT a failure; surface to user, block on user response (this is one of two cases where Wave 0 can pause for human input; see §7 Open Decision 4).

#### 2.1.7 Integration into orchestrate.ts

See §4.2 for the exact dispatch insertion point.

### 2.2 Wave 0b — Optimal architecture with meta-thinking gap detection

#### 2.2.1 Purpose

Given the requirements + language choice, design the system architecture, using the meta-thinking pattern from `~/.claude/skills/meta-thinking.md` and the n-order-effects pattern from `~/.claude/skills/n-order-effects.md` to surface architectural gaps that would otherwise only appear after build-out.

The "meta" angle is critical: Wave 0b doesn't just propose an architecture — it questions whether the *frame* of the proposal is right. Skipping the meta layer is a §1.5 violation: the brief specifically says "the proposal's frame is right" is the load-bearing test.

#### 2.2.2 Inputs

- `requirements: string`
- `language: string` (from Wave 0a)
- `secondary?: string` (from Wave 0a if polyglot)
- `hardwareTarget?: HardwareTarget` (if §3 promotes it before 0b)

#### 2.2.3 Outputs

- **`.spec2/wave-0/architecture.json`** (machine-readable):
  ```jsonc
  {
    "selected_style": "modular-monolith" | "microservices" | "event-driven" | "layered" | "pipes-and-filters" | "actor-model" | "cli-tool" | "library" | "<custom-with-rationale>",
    "frame": "<the active design frame, e.g. 'reversibility-prioritized', 'throughput-prioritized', 'team-cognitive-load-prioritized'>",
    "rejected_styles": [
      { "style": "microservices", "rationale": "<≤300 chars>", "n_order_failure_mode": "<≤300 chars>" }
    ],
    "rejected_frames": [
      { "frame": "cost-minimization", "rationale": "<≤200 chars>" }
    ],
    "gaps_surfaced": [
      {
        "id": "gap-001",
        "category": "non-functional" | "data" | "security" | "operational" | "regulatory" | "external-dependency",
        "description": "<what's underspecified>",
        "severity": "blocking" | "high" | "medium" | "low",
        "mitigation": "<what to do — either ask user, or assume X with documented assumption>",
        "owner": "user" | "wave-0c" | "wave-1" | "wave-6"
      }
    ],
    "components_sketch": [
      { "name": "<name>", "purpose": "<≤200 chars>", "boundary_rationale": "<why this is one component not two>" }
    ],
    "n_order_trace": {
      "order_1": "<direct mechanical effect of the selected style>",
      "order_2": "<who's affected, what state changes>",
      "order_3": "<behavioral response>",
      "order_4": "<systemic feedback>",
      "termination_reason": "<why we stopped at this order>"
    },
    "generated_at": "<ISO8601>",
    "wave_0b_version": "1.0"
  }
  ```
- **`.spec2/wave-0/architecture.md`** (human-facing — includes Mermaid diagram of the components_sketch + the n_order_trace as prose + the gaps_surfaced as a checklist)

#### 2.2.4 Algorithm (logic sketch)

The algorithm has three phases, executed by three distinct LLM calls (separate prompts, no shared context — this preserves the §1.1 isolation contract within Wave 0b itself, even though they all reason about the same artifact).

**Phase 1 — Frame selection (one LLM call):**
- Input: requirements + language.
- Output: locked frame + 3-5 discarded frames with rationale. Same shape as `meta-thinking.md` FRAME-SELECTED block.
- Mandatory: must produce ≥3 discarded frames. Empty discard list = the LLM didn't actually consider alternatives = regenerate with stricter prompt.

**Phase 2 — Architecture proposal under the locked frame (one LLM call, fresh agent — does not see Phase 1's discarded frames):**
- Input: requirements + language + LOCKED frame name + frame justification (≤200 chars from Phase 1).
- Output: `selected_style` + `components_sketch` + `rejected_styles` (must propose ≥2 styles considered + rejected). Same shape as the `architecture.json` style sections.
- Why fresh agent: the Phase 1 agent might anchor on "the frame I picked is right" and select a style that fits the frame even when a better style would force a frame revisit. By giving Phase 2 only the locked frame and not the deliberation, we get a fresher style choice.

**Phase 3 — N-order trace + gap surfacing + post-n-order meta-check (multi-call loop, fresh agent — does not see Phase 1 or Phase 2's rejected-style rationale):**
- Input: requirements + language + FINAL frame + FINAL style + components_sketch.
- Output: `n_order_trace` (1st through Nth orders, terminator), `gaps_surfaced` array (per the n-order-effects worked-example pattern in `~/.claude/skills/n-order-effects.md`).
- The "meta" check: Phase 3 is REQUIRED to attempt to invalidate the Phase 2 architecture from the 3rd-order angle. If its n_order_trace surfaces a 3rd-or-higher-order failure mode that fundamentally breaks the architecture, Wave 0b loops at Phase 1 with the invalidating finding fed in as additional context.
- **Loop termination (founder-direction v1.1, unbounded with convergence):** the design-phase Phase 3 loop runs until ONE of the following fires, in order:
  1. **Plateau-of-zero:** post-n-order meta-check (per §2.4) returns ZERO new gaps for **two consecutive iterations**. The architecture has been examined twice in a row and nothing further surfaces — the design is meta-clean. Clean exit.
  2. **Cycle detection:** Phase 1's frame-selection produces a frame that has already passed Phase 3 in a prior iteration of this Wave 0b run. The same surface is being re-explored — no further information can be extracted. Clean exit; flag as "cycle-terminated" in the artifact.
  3. **Stuck-detection (§2.5):** the same gap (by structural fingerprint) appears in N=3+ consecutive iterations without the architecture changing. Escalate to user — the LLM cannot fix it, founder must redirect.
- **Numeric iteration cap REMOVED.** The prior v1.0 spec had `max 1 restart — hard cap, then escalate`. Founder direction 2026-06-01: meta-thinking is "the step most likely to optimize until clean to an optimal system; let it loop until it finishes." Cost-capping the design phase is the wrong move — design defects propagate to Wave 6 at 30-40× the token cost (per §5.3). Unbounded ≠ infinite: the three convergence conditions above guarantee termination on any well-posed problem; the stuck-detection rail catches ill-posed ones.

#### 2.2.5 Tooling

- **3 LLM calls** as described. Each is a separate `getLLMClient().prompt()` call with explicit isolation (no shared chat history between phases — fresh prompt each).
- **Optional MCP escalation:** if any phase has ≥2 plausible candidates at near-tied scores, Wave 0b may escalate to the `actor-critic-thinking` MCP for one round of explicit attack/defend. The MCP wiring exists in the harness (see `actor-critic-workflow.md`). Default off; flag-on per build via `WAVE_0B_USE_ACTOR_CRITIC=true` env var. Off by default because adding MCP overhead to every build is rejected by §1.10 (token + latency cost without revenue payoff).
- **Validator:** `wave-0b-validator.ts` (paper-spec). Checks: (a) frame chosen + ≥3 discarded, (b) selected_style ∈ enumerated set OR has custom rationale of ≥200 chars, (c) ≥2 rejected_styles, (d) n_order_trace has ≥4 orders, (e) gaps_surfaced is an array (may be empty if the architecture is genuinely simple; ≥1 entry is informational signal that the LLM is thinking), (f) every gap has a non-null `owner`.

#### 2.2.6 Termination conditions

- **Success:** all 3 phases complete, validator passes, Phase 3 loop terminates with `plateau-of-zero` or `cycle-detected`.
- **Failure modes:**
  - Any phase output unparseable → regenerate that phase up to 3 attempts (per-phase, not per-wave). This is a *prompt-failure* retry cap — it bounds malformed-output retries, not design-quality iterations. (Same rationale as §2.3.9: prompt-failure retries are cost-bounded I/O errors; design loop iterations are quality-bounded optimization steps. Different concerns, different caps.)
  - Phase 3 surfaces a fundamental invalidation → loop at Phase 1 with the invalidating finding fed in as additional context. **No numeric restart cap** — see §2.2.4 Phase 3 termination rules.
  - Stuck-detection fires (per §2.5): same gap structural-fingerprint persists 3+ consecutive iterations with no design change → throw `StuckOnFinding` with the finding + iteration history surfaced. User decides whether requirements are unbuildable, language is wrong, or the gap is a known limitation to accept.
  - Cost-overrun *soft warning*: if Phase 3 loop exceeds 8 iterations OR cumulative Wave 0b token spend exceeds the §3.4 cost threshold, log a warning to the review package and continue. The loop is unbounded, but the user gets a visible signal if the design surface is unusually deep — useful for triaging "is my requirements doc too vague?" without halting the loop.

#### 2.2.7 Meta-check: this doc's own Wave 0b on itself

Per the brief's adversarial-completion criterion #3 ("if you propose Wave 0b without surfacing your own design's gaps, you've failed the meta layer"), here are gaps in *this document's* Wave 0b design, surfaced by deliberately running the Phase 3 mental pass over the Phase 2 proposal:

- **Gap 0b-A (medium):** Phase 2 is told only the LOCKED frame from Phase 1, not the discarded frames. This is intentional (anchoring prevention) but loses information — if Phase 1 narrowly chose Frame A over Frame B, Phase 2 won't know Frame B was a near-miss and might design an architecture that's worse under Frame B than the alternative would have been. *Mitigation:* if Phase 1 reports any discarded frame within 0.1 score of the chosen frame, include that frame's name (NOT its rationale) in Phase 2's input as a "consider this perspective at design time" nudge. Cheap and preserves most of the isolation benefit.
- **Gap 0b-B (high):** Phase 3 sees the Phase 2 architecture and is asked to invalidate it. But Phase 3 is the same model class as Phase 2 — it has the same blind spots. Cross-model would help (Anthropic for Phase 2, Gemini for Phase 3). *Mitigation:* if available, route Phase 3 to a different provider than Phase 2's. If only one provider is configured, log a warning to the review package. Same provider acceptable for v1, cross-provider is v1.1 polish.
- **Gap 0b-C (RESOLVED in v1.1):** v1.0 had a "max 1 restart" hard cap that was arbitrary. v1.1 founder-direction unbinding removed the numeric cap entirely; Phase 3 loops until convergence (per §2.2.4 termination rules) or stuck-detection (§2.5) fires. Telemetry on iter-count + meta-check gap-counts is still logged for usage-data tuning of the convergence thresholds, but the loop is no longer constrained by an a-priori numeric.
- **Gap 0b-D (low):** The `components_sketch` produced in Phase 2 is structurally identical to what Wave 1 produces. We risk Wave 0b becoming a duplicate of Wave 1, just earlier. *Mitigation:* Wave 0b's `components_sketch` is explicitly labeled as "indicative, not final"; Wave 1 still runs and may add/remove/rename components. The check `extractSubsystems(systemSpec)` in Wave 1 (orchestrate.ts:299) is the canonical source for downstream waves. Wave 0b's sketch is read-only input to Wave 1, like systemSpec is to Wave 3.
- **Gap 0b-E (high):** No mechanism for the *user* to inject gap-relevant context that the LLM can't infer. If the requirements say "build an LMS" but the user knows the LMS has to plug into Canvas (an unsaid constraint), Wave 0b will surface the integration as a gap but won't know the answer. *Mitigation:* introduce Wave 0₀ (requirements clarification) BEFORE 0a — see §3.1 below. This is the strongest case for promoting requirements-clarification to MUST-HAVE.

These 5 gaps are part of the deliverable. Surfacing them validates that the meta layer works on its own design. They also drive §7 Open Decisions.

### 2.3 Wave 0c — Recursive actor-critic optimization to pareto-frontier-clean

#### 2.3.1 Purpose

Take the Wave 0b architecture and run a recursive actor-critic loop until the design is on the pareto frontier (no candidate strictly dominates) for the target hardware. This is the "polish" wave — Wave 0b can produce a working architecture; Wave 0c makes it not-worse-than-any-known-alternative on the locked axes.

#### 2.3.2 Inputs

- `architectureV0: ArchitectureJSON` (output of Wave 0b)
- `requirements: string`
- `language: string` (Wave 0a)
- `hardwareTarget: HardwareTarget` (if §3 promotes it; default-deployment otherwise)
- `axes: ParetoAxes` (locked list — see §2.3.3 for definition)

#### 2.3.3 What "pareto-frontier-clean" means concretely (this is the load-bearing definition — David called it out as required)

The architecture is evaluated on 7 axes. Each axis is scored 0-1 by an LLM-judge call with a deterministic-where-possible rubric. The 7 axes are:

| Axis | Definition | Scoring approach |
|------|-----------|-------------------|
| `quality` | Per-component cohesion, dependency clarity, error-handling clarity, signature consistency | LLM-judge scored against rubric |
| `cost` | Estimated runtime infra cost (CPU/memory class + storage class + LLM-API cost if applicable) for the hardware target | Computed from a cost table per language/style + LLM estimate of intensity |
| `performance` | Latency / throughput characteristics under the hardware target | LLM-judge against rubric (real benchmarks are Wave 6+) |
| `security` | Surface area (count of external boundaries × auth requirements × data-sensitivity); lower is better | Counted deterministically + LLM judges the `data-sensitivity` weight |
| `maintainability` | Cyclomatic-complexity-proxy at the architecture level (component count, fan-out, depth of dependency tree) | Counted deterministically |
| `portability` | How locked-in is the architecture to the chosen language/runtime/cloud-provider? | LLM-judge against rubric (any platform-specific service = penalty) |
| `dev-velocity` | Estimated time-to-first-running-component (component count × per-component scaffolding cost in this language) | Computed |

A candidate architecture **A dominates B** iff:
- A is ≥ B on every axis, AND
- A is strictly > B on at least one axis.

The frontier is the set of candidates not dominated by any other. **Pareto-frontier-clean** means: the current candidate is on the frontier, i.e. no other candidate the actor has proposed strictly dominates it.

This definition is implementable: the actor proposes a candidate, the critic scores it on all 7 axes, the loop maintains a frontier set, a new candidate is "frontier-clean" iff it survives the domination check against every existing frontier member.

#### 2.3.4 Outputs

- **`.spec2/wave-0/architecture-final.json`** (machine-readable):
  ```jsonc
  {
    "final_architecture": { /* same shape as Wave 0b's architecture.json */ },
    "pareto_frontier": [
      { "candidate_id": "c-001", "axes_score": { "quality": 0.85, "cost": 0.7, ... }, "dominated": false },
      { "candidate_id": "c-003", "axes_score": { ... }, "dominated": false }
    ],
    "selected_from_frontier": "c-001",
    "selection_rationale": "<why this one over other frontier members; references David's project-level priorities — usually 'maintainability + dev-velocity' for solo founder>",
    "actor_critic_log": [
      {
        "iter": 1,
        "actor_candidate_id": "c-002",
        "critic_findings": [
          { "axis": "security", "score": 0.4, "root_cause": "<≤200 chars>", "fix_effect": "<≤200 chars>" }
        ],
        "verdict": "dominated" | "frontier-add" | "frontier-displace"
      }
    ],
    "termination": {
      "verdict": "threshold-hit" | "plateau" | "cycle-detected" | "stuck-on-finding",
      "reason": "<sentence>",
      "iters": 4,
      "final_frontier_size": 2
    },
    "generated_at": "<ISO8601>",
    "wave_0c_version": "1.0"
  }
  ```

The `final_architecture` block is what flows forward as the canonical architecture to Wave 1. The frontier + log are audit trail.

#### 2.3.5 Algorithm — recursive actor-critic loop

This is the most algorithmic substage and the brief explicitly requires it be concrete. Logic:

```
INIT:
  frontier = [ Wave 0b's architecture ]   // initial frontier contains only the baseline
  iter = 0
  // NUMERIC MAX_ITER CAP REMOVED in v1.1 — see §2.3.6 for convergence-based termination.
  // Founder direction 2026-06-01: design-phase loops are unbounded; cost-cap is a soft warning
  // surfaced via §3.4 cost hook + §2.5 stuck-detection, not a hard stop.
  PLATEAU_EPS = 0
  PLATEAU_WINDOW = 2  // 2 consecutive iters with no frontier change (frontier is discrete; tighter than continuous-metric default)
  no_change_streak = 0
  fingerprint_streak = {}   // map: fingerprint → consecutive-iter-count, per §2.5
  cost_warned = false       // soft cost warning flag, fires once
  meta_check_history = []   // tracks post-n-order meta-check verdicts per iter, per §2.4
  LOG = []

LOOP:
  iter += 1

  // ACTOR PHASE
  // Actor is shown the current frontier (anonymized — no critic comments)
  // and asked to propose ONE candidate that targets a specific axis
  // where the frontier is weakest. "Weakest axis" = the axis with the lowest
  // *minimum* score across frontier members.
  weakest_axis = argmin(axis -> min(member.score[axis] for member in frontier))
  actor_candidate = LLM.propose_optimization(
    requirements,
    language,
    frontier,
    target_axis = weakest_axis,
    constraint = "must not drop any other axis below 0.5"
  )

  // CRITIC PHASE (n-order effects pass)
  // Critic scores the candidate on all 7 axes + identifies n-order issues
  // For each issue: root cause + the effect of fixing it (the "corresponding effect")
  critic_scores, critic_issues = LLM.critique(
    candidate = actor_candidate,
    axes = all_7_axes,
    require = "for each issue, give root_cause AND the n-order effect of the fix"
  )

  // POST-N-ORDER META-CHECK (NEW in v1.1, per §2.4)
  // After every n-order pass, fire a meta-thinking audit specifically scoped to:
  // "did the n-order projection miss a dimension, a stakeholder, a time horizon,
  // or a 2nd-order effect that would matter?"
  meta_gaps = LLM.meta_audit_n_order(
    candidate = actor_candidate,
    n_order_trace = critic_issues,
    frontier_context = frontier,
    require = "enumerate dimensions/stakeholders/time-horizons/2nd-order-effects MISSED by the n-order trace; empty array if none"
  )
  meta_check_history.append({iter, gaps_found: len(meta_gaps), gap_summaries: [g.summary for g in meta_gaps]})

  // If meta-check found gaps, loop n-order again with the gaps as input
  // (this is the founder-direction post-n-order meta-check protocol)
  if len(meta_gaps) > 0:
    critic_issues_augmented = critic_issues + meta_gaps   // gaps re-enter as input
    critic_scores, critic_issues = LLM.critique(
      candidate = actor_candidate,
      axes = all_7_axes,
      additional_context = meta_gaps,
      require = "incorporate the previously-missed dimensions; re-score"
    )
    // meta-check re-fires on the re-traced n-order; loop continues internally until meta returns zero gaps
    // INNER convergence: meta-check returns zero gaps OR same gap-fingerprint repeats (§2.5 inner-loop guard)
    meta_iter = 0
    while len(meta_gaps) > 0:
      meta_iter += 1
      meta_gaps = LLM.meta_audit_n_order(candidate=actor_candidate, n_order_trace=critic_issues, ...)
      meta_check_history.append({iter, meta_subiter: meta_iter, gaps_found: len(meta_gaps), ...})
      if len(meta_gaps) > 0:
        critic_scores, critic_issues = LLM.critique(... additional_context = meta_gaps ...)
      // §2.5 stuck-detection inside the meta-loop: same gap fingerprint 3+ times → escalate
      if fingerprint_repeats(meta_gaps, fingerprint_streak, k=3):
        raise StuckOnFinding(scope="wave-0c-meta-inner-loop", fingerprint=..., iter=iter, meta_subiter=meta_iter)

  // DOMINATION CHECK
  if any(existing dominates actor_candidate for existing in frontier):
    verdict = "dominated"
    // candidate doesn't make the frontier; log and continue
  else:
    // candidate makes the frontier; check if it displaces anything
    displaced = [m for m in frontier if actor_candidate dominates m]
    frontier = (frontier - displaced) + [actor_candidate]
    if displaced:
      verdict = "frontier-displace"
      no_change_streak = 0
    else:
      verdict = "frontier-add"
      no_change_streak = 0

  if verdict == "dominated":
    no_change_streak += 1

  LOG.append({iter, actor_candidate, critic_scores, critic_issues, meta_gaps_initial, verdict})

  // STUCK-DETECTION (§2.5) — check OUTER loop fingerprint streaks
  // Compute structural fingerprint of the dominant critic_issue this iter; track consecutive matches
  current_fingerprint = structural_fingerprint(critic_issues, ignore=["wording","ordering"])
  if current_fingerprint in fingerprint_streak:
    fingerprint_streak[current_fingerprint] += 1
  else:
    fingerprint_streak = { current_fingerprint: 1 }   // reset on any new fingerprint
  if fingerprint_streak[current_fingerprint] >= 3 and no_design_change_since(fingerprint_streak[current_fingerprint], LOG):
    raise StuckOnFinding(scope="wave-0c-outer-loop", fingerprint=current_fingerprint, iter=iter)

  // SOFT COST WARNING (NOT a hard stop)
  if cumulative_tokens(LOG) > §3.4_cost_threshold and not cost_warned:
    log_warning("wave-0c: cost threshold exceeded at iter {iter}; loop continues per founder-direction unbounded design policy")
    cost_warned = true

  // TERMINATION CHECK (in order) — convergence-only, NO numeric iter cap
  if all_axes_at_threshold(frontier, threshold = 0.85):
    termination = "threshold-hit"
    break
  if no_change_streak >= PLATEAU_WINDOW:
    termination = "plateau"
    break
  if cycle_detected(LOG, candidates_already_passed_critic = true):
    // a candidate fingerprint that already passed critic in a prior iter is being re-proposed
    termination = "cycle-detected"
    break
  // No max-iter break — loop continues until one of the above fires OR stuck-detection raises

SELECT:
  // Pick from frontier using project-priority weights
  // Defaults for solo-founder pre-revenue: maintainability 0.3, dev-velocity 0.3, cost 0.2, others 0.04 each
  weighted_scores = [(m, sum(m.score[axis] * weight[axis] for axis in axes)) for m in frontier]
  selected = argmax(weighted_scores)

OUTPUT:
  architecture-final.json with selected, frontier, log, termination verdict, meta_check_history
```

#### 2.3.6 Termination conditions (the convergence question — founder-direction v1.1 revision)

**Founder direction 2026-06-01 (verbatim):** "for spec 2, the meta think check should be unlimited. its the step most likely to optimize until clean to an optimal system. let it loop until it finishes. same with the n order effects."

**v1.1 termination model — convergence-based, NO numeric iter cap.** Three convergence verdicts, evaluated in this order each iteration:

1. **`threshold-hit`** — all axes of all frontier members reach ≥0.85. Clean exit. **Threshold value 0.85** is conservative; ≥0.9 would be unrealistic given LLM-judge noise (~±0.1 per axis per call); <0.8 would be too loose. 0.85 is the calibration target; tune with usage data.
2. **`plateau`** — 2 consecutive iters where the actor's proposed candidate is dominated by the existing frontier (`no_change_streak >= 2` with `PLATEAU_WINDOW = 2`). The PLATEAU_WINDOW of 2 is tighter than the convergence skill's default of 3 because frontier-set convergence is structurally tighter than continuous-metric convergence — once two distinct candidates fail to improve, the actor is unlikely to find a third in this language/style combination. PLATEAU_EPS = 0 because frontier membership is discrete (you're either on or off).
3. **`cycle-detected`** — the actor proposes a candidate whose structural fingerprint matches one that already passed (or failed) the critic + meta-check in a prior iteration of this run. Cycle = same surface being re-explored. Clean exit with flagged verdict so the user can see the loop hit its natural ceiling rather than a numeric cap.

**Numeric MAX_ITER REMOVED.** The prior v1.0 spec had `MAX_ITER = 5` as a hard cap, justified by token cost. Founder direction: **design-phase loops should be unbounded** — design defects propagate to Wave 6 at 30-40× the token cost (per §5.3), so cost-capping the design phase is the wrong move. The pareto loop is the single place in Wave 0 where architectural optimization happens; cutting it short to save 40K tokens of design-phase compute creates 1.2M+ tokens of Wave-6 regeneration waste downstream.

**Stuck-detection (§2.5) replaces MAX_ITER as the loop safety rail.** Unbounded ≠ infinite. The three convergence conditions above terminate cleanly on any well-posed problem. For ill-posed problems (LLM stuck on a finding it can't fix, oscillation between two non-dominating candidates), §2.5's structural-fingerprint detector raises `StuckOnFinding` and surfaces to the user — preserves §1.5 ASK gate for "loop cannot self-resolve."

**Cost-cap moved from hard stop to soft warning.** Cumulative Wave 0c token spend exceeding §3.4 cost threshold logs a one-time warning to the review package. Loop continues. This preserves visibility (user sees "this build is unusually deep on design") without sacrificing optimization quality. If the user wants to halt, they can `/spec2-cancel` — same as any other long-running operation.

**Telemetry expectation:** in steady-state, expect Wave 0c to terminate at `threshold-hit` or `plateau` within 3-8 outer iterations on well-shaped requirements. Beyond 10 iterations is a signal worth investigating (requirements vague? language wrong? hardware target underspecified?). The cost-warning at §3.4 threshold provides the natural review trigger.

#### 2.3.7 What an "optimization candidate" actually looks like (brief specifically flagged this as required)

A candidate is **not** a free-form prose suggestion. It's a structured edit relative to the prior architecture, with all 7 axes recomputed. Format:

```jsonc
{
  "candidate_id": "c-007",
  "parent_id": "c-003",                   // which frontier member this edits
  "delta": {
    "added_components": [{ "name": "...", "purpose": "..." }],
    "removed_components": ["<name>"],
    "renamed_components": [{ "from": "...", "to": "..." }],
    "added_dependencies": [{ "from": "...", "to": "...", "contract": "..." }],
    "removed_dependencies": [...],
    "changed_boundaries": [{ "component": "...", "now_spans": "..." }]
  },
  "target_axis": "security",                // which axis this candidate targets
  "claimed_impact": {
    "security": "+0.15",
    "cost": "-0.05",
    "maintainability": "0.0",
    ...
  },
  "rationale": "<≤500 chars — why this delta improves the target axis>"
}
```

The critic recomputes all 7 axes and compares against `claimed_impact`; large mismatches (claimed +0.15, actual +0.02) are themselves a critic finding (the actor over-claimed). This catches actor over-optimism without requiring a separate verification step.

#### 2.3.8 Tooling

- **3 LLM calls per outer iteration** (1 actor + 1 critic + 1 post-n-order meta-check per §2.4). Inner meta-gap loop adds 1-2 more critic + meta calls per gap-loop iteration. **No iteration ceiling** — see §2.3.6 for convergence-based termination + §2.5 stuck-detection rail.
- **Actor, critic, AND meta-auditor MUST be different agents** — extends kernel-§4 rule ("Never let the same agent that wrote the code audit its own work"). Implementation: separate prompts with explicit persona injection; cross-provider when available (Anthropic for actor, Anthropic-different-system-prompt OR Gemini for critic, third distinct context for meta-auditor). When only one provider is configured, distinct system prompts + zero shared chat history is the minimum viable separation.
- **No MCP wiring needed for v1** — the `actor-critic-thinking` MCP from `actor-critic-workflow.md` is the prior-art reference but Wave 0c implements the loop in-orchestrator because the MCP's loop control is generic-purpose; we need pareto-specific + post-n-order-meta-check termination logic.
- **Validator:** `wave-0c-validator.ts` (paper-spec). Checks: (a) frontier is non-empty, (b) every frontier member has all 7 axes scored, (c) `selected_from_frontier` is in `pareto_frontier`, (d) `actor_critic_log` length matches `termination.iters` (no MAX_ITER ceiling check — removed in v1.1), (e) `termination.verdict` ∈ {threshold-hit, plateau, cycle-detected, stuck-on-finding}, (f) every log entry has actor_candidate AND critic_findings AND meta_gaps_initial AND verdict, (g) `meta_check_history` is present and non-empty (every iter must have a post-n-order meta-check entry per §2.4).

#### 2.3.9 Failure modes

- Actor produces malformed candidate JSON → regenerate that iter's actor call (max 3 per iter — this is a **prompt-failure retry cap**, NOT a design-quality cap; bounds malformed-output I/O errors, does not bound optimization steps); 3 failures = abort Wave 0c with whatever frontier exists.
- Critic produces malformed scores → regenerate that iter's critic call (max 3 per iter — same prompt-failure cap as above).
- Meta-auditor produces malformed gap list → regenerate (max 3 per iter); 3 failures on the meta-auditor specifically means treat as `gaps = []` for this iter (best-effort; surface in review package).
- Actor proposes the same candidate twice in a row → log as plateau signal; force `verdict = "dominated"` to advance the plateau counter (`no_change_streak`).
- Actor proposes a candidate whose structural fingerprint matches one already-passed in prior iter → cycle detected; terminate per §2.3.6 verdict 3.
- Stuck-detection fires (§2.5) → raise `StuckOnFinding`, surface to user with iteration history + finding fingerprint + proposed escalation options.
- Loop terminates at `plateau` with no frontier growth past the baseline → emit a warning; Wave 0b's architecture is the final architecture (the loop didn't improve it but didn't harm it). Build continues.

### 2.4 Post-n-order meta-check protocol (NEW in v1.1, founder-direction)

**Founder direction 2026-06-01 (verbatim):** "run a meta check after each n order loop as well to ensure we cover bases."

**Scope:** every n-order-effects pass in Wave 0 — explicitly Wave 0b Phase 3 (§2.2.4) and every Wave 0c critic iteration (§2.3.5) — is followed by a meta-thinking audit specifically scoped to: **"did the n-order projection miss a dimension, a stakeholder, a time horizon, or a 2nd-order effect that would matter?"**

**Audit prompt structure (paper-spec; exact text is implementation work):**
```
[INPUT]
- Candidate architecture / proposal under audit
- n-order trace just produced (orders 1..N + termination reason)
- Frontier context (for Wave 0c) or final architecture (for Wave 0b Phase 3)

[META-AUDIT TASK]
Examine the n-order trace above. Was a dimension missed?
- Stakeholders not at the table (end-user, regulator, operator, future-maintainer, integrator)?
- Time horizons not traced (Day 1 / Month 6 / Year 3 effects all enumerated)?
- 2nd-order effects not extracted (behavioral incentive shifts, Goodhart effects, equilibria changes)?
- 4th-or-higher-order effects under-explored (cultural/precedent/lock-in consequences)?

Return: JSON array of gap objects. Empty array if the trace is comprehensive.

[OUTPUT SHAPE]
[
  { "missed_dimension": "regulatory", "summary": "...", "structural_fingerprint": "<stable hash>", "severity": "low|medium|high|blocking" }
]
```

**Loop semantics:**
- If meta-auditor returns `gaps = []` → n-order trace is meta-clean; advance to next iteration / phase / wave (depending on context).
- If meta-auditor returns `len(gaps) > 0` → loop n-order again with the gaps surfaced as input to the critic ("incorporate these previously-missed dimensions; re-score"). Inner loop continues until meta returns `gaps = []` OR §2.5 stuck-detection fires (same fingerprint 3+ times in the inner loop).
- No numeric inner-loop cap. Convergence is the only termination.

**Why this matters:** the founder's hypothesis is that meta-thinking is the step most likely to optimize toward an actually-clean design. A single-shot meta-audit catches first-order omissions; a looped meta-audit catches the meta-omission ("the first meta pass missed that the second-order regulatory effect itself has a third-order brand consequence"). Empirically, expect inner meta-loops to terminate within 2-4 iterations on well-shaped requirements.

**Storage:** every iteration's meta-audit verdict is appended to `meta_check_history` in `architecture-final.json` for audit-trail purposes (per §15 canonical-state discipline).

### 2.5 Stuck-detection safety rail (NEW in v1.1)

**Purpose:** unbounded ≠ infinite. The design-phase loops are unbounded by numeric iteration count, but they are NOT permitted to loop indefinitely on a finding the LLM cannot fix. This rail prevents an LLM from spinning on the same gap or critic-finding for the entire token budget.

**Mechanism:**

1. **Structural fingerprint per finding.** Each critic finding, n-order gap, or meta-audit gap is hashed to a stable structural fingerprint that ignores wording/ordering and captures the *substance*: the affected component, the issue category, the dimension class. Example: a finding "the auth component has no rate-limit on /login" has the same fingerprint as "/login on the auth component lacks rate-limiting" — different wording, same substance.

2. **Per-iteration tracking.** The orchestrator maintains a `fingerprint_streak` map: `{fingerprint: consecutive_iter_count}`. On each new iteration, increment the count for any fingerprint that re-appears; reset all other fingerprints to 0 (we only care about *consecutive* repeats, not lifetime counts).

3. **Stuck threshold:** if `fingerprint_streak[fp] >= 3` AND the design has not materially changed in those 3 iterations (verified by hashing the current architecture's structural footprint each iter) → raise `StuckOnFinding`.

4. **Escalation payload:**
   ```jsonc
   {
     "scope": "wave-0b-phase3" | "wave-0c-outer" | "wave-0c-meta-inner",
     "fingerprint": "<the repeating finding's fingerprint>",
     "iter": <int>,
     "finding_summary": "<≤300 chars — what the LLM keeps surfacing>",
     "finding_history": [ /* the 3+ iterations where this fingerprint appeared */ ],
     "design_unchanged_evidence": "<hash equality + diff null>",
     "user_options": [
       "REDIRECT — provide additional context that addresses the finding (most common)",
       "ACCEPT — accept the gap as a known limitation, log to backlog, advance loop with finding marked 'accepted'",
       "ABORT — Wave 0 cannot resolve this with current requirements; user revises requirements doc and re-runs",
       "OVERRIDE — force-advance the loop, marking the gap as 'acknowledged-but-deferred'; will surface in Wave 1 review"
     ]
   }
   ```

5. **Why this is NOT a cap on quality:** stuck-detection only fires when the LLM has surfaced *the same gap* 3 times consecutively *without changing the design*. This is qualitatively different from "ran 5 iterations and stopping." A productive loop where each iteration surfaces a new gap or makes a different change will never trigger stuck-detection — the fingerprint set is changing.

**Per-scope cap variations:**
- Wave 0c outer loop: 3 consecutive same-fingerprint iters → escalate.
- Wave 0c meta-inner loop: 3 consecutive same-fingerprint iters → escalate (slightly more conservative because inner loops are cheaper but compound).
- Wave 0b Phase 3 loop: 3 consecutive same-fingerprint iters → escalate (matches outer-loop semantics — Phase 3 IS the outer loop for Wave 0b).

**Interaction with cycle detection:** cycle detection (in §2.3.6) catches the case where a *candidate* that already passed the critic is re-proposed — that's a structurally different signal (the candidate is going in circles) from stuck-detection (the *finding* is going in circles regardless of what candidate is proposed). Both are needed; they fire under different failure modes.

---

## 3. Other planning stages — what else might be missing

The brief lists 12 candidate stages. Each gets an explicit accept/reject below with rationale grounded in §1.10 (revenue priority) + spec2's value prop ("requirements-to-code without babysitting"). The decision is binary; a stage that's "kind of valuable" is rejected — Wave 0 must not become a 10-stage planning ceremony.

### 3.0 Decision rubric

A stage is MUST-HAVE iff:
- The defect class it prevents is **non-catchable** at any later wave (Wave 1 validator, §11 sub-waves, runtime), OR
- It's a **dependency** for Wave 0a/0b/0c (a downstream stage needs its output).

A stage is NICE-TO-HAVE iff:
- The defect class it prevents IS catchable later, but at materially higher cost (≥3× token overhead).

A stage is OUT-OF-SCOPE iff:
- It addresses a class of risk that spec2 isn't trying to solve, OR
- It belongs to a different tool in the 3-tool pipeline (planning MCP, RNOP) per ROADMAP §11.4.

### 3.1 Requirements validation / clarification

**Decision: ACCEPT as MUST-HAVE, slot as Wave 0₀ (before 0a).**

**Rationale:** Gap 0b-E above is the killer case. If the user says "build an LMS" without specifying integrations, Wave 0a picks a language for "generic LMS" (probably Python or TS), Wave 0b designs a generic LMS architecture, and Wave 1 produces a generic LMS — none of which is what the user actually needs. The defect is only catchable when the user looks at the Wave 6 code and says "this doesn't integrate with Canvas." That's 4 hours and tens of thousands of tokens too late.

**Cheap to do.** One LLM call that scans requirements for known-ambiguous patterns and asks clarifying questions. Same shape as a junior engineer asking 5 questions before writing code. Token cost: ~1K input + ~1K output = ~2K tokens.

**Failure mode it prevents:** the entire pipeline runs on the wrong understanding of the requirements.

**Naming:** **Wave 0₀ — Requirements Clarification.** Sequenced before 0a. Its output is an *augmented requirements* string that 0a/0b/0c consume in place of the original.

**Caveat:** must be *bounded*. If 0₀ asks more than 3 questions, surface that as a signal the requirements are too vague to proceed and let David expand the requirements doc before retry. We are not building a Socratic-method tutor; we are catching the obvious gaps.

### 3.2 Constraint elicitation (NFRs: latency, throughput, memory, regulatory, accessibility)

**Decision: ACCEPT as MUST-HAVE, MERGED into Wave 0₀ — not a separate stage.**

**Rationale:** NFR elicitation is a sub-case of requirements clarification — the same "what's underspecified?" question, scoped to non-functional dimensions. Splitting it into its own stage doubles the LLM cost without doubling the value. The Wave 0₀ prompt has an explicit NFR section that asks: latency target? throughput floor? memory ceiling? regulatory regime (HIPAA / SOC2 / GDPR / FedRAMP / none)? accessibility level (WCAG A / AA / AAA / not user-facing)?

NFR outputs flow into the augmented requirements string. Wave 1's existing "Non-Functional Requirements" section (orchestrate.ts:277-281) consumes them.

**Why merge rather than separate:** the goodvibes `requirements_completeness` review agent (ROADMAP §10) is the post-Wave-0 catch — duplicating the same scan upstream and downstream wastes tokens. The pre-Wave-1 scan is the only place where the question changes the architecture (NFR-driven architecture decisions); the post-Wave-1 scan is the place where the question changes individual specs.

### 3.3 Risk identification + mitigation planning

**Decision: REJECT as a standalone stage, MERGED into Wave 0b's `gaps_surfaced` array.**

**Rationale:** This is already what Wave 0b's gap-surfacing phase does (see §2.2.3 — `gaps_surfaced` has a `category` field that includes `regulatory`, `external-dependency`, `operational`). Splitting risk into its own stage means running the same n-order trace twice. Cost without benefit.

**Caveat:** the `severity` enum in `gaps_surfaced` needs to include "operational risk" categories — already covered by the existing enum.

### 3.4 Cost modeling (LLM tokens + runtime infra)

**Decision: ACCEPT, partially — runtime infra cost MERGED into Wave 0c's `cost` axis; LLM token cost is a SEPARATE Wave 0 OUTPUT, not a stage.**

**Rationale:** Wave 0c already scores `cost` per candidate architecture (runtime infra cost — see §2.3.3). That's one half. The other half (LLM tokens to run the *spec2 pipeline itself* on this requirement) is a single deterministic computation, not a stage:

- Estimate: `n_components × (Wave 6.0 baseline + expected_regen_count × Wave 6.0)` + Wave 0/1/2/3/4/5 fixed costs.
- This is computed from `components_sketch.length` after Wave 0b runs. ~10 lines of code, no LLM needed.
- Output written to `.spec2/wave-0/pipeline-cost-estimate.json`. Surfaced to user in the Wave 0 review package before Wave 1 starts.

If estimated cost > a configurable threshold (default $5 of API spend at current Anthropic Sonnet prices), pause and ask the user. Otherwise proceed.

This is a §1.5/§1.10 protection: a runaway 100-component build that burns $200 of API credit overnight is one of the worst things spec2 could do to a solo founder. The cost estimate is cheap insurance.

**No new stage needed — embed as a post-0b/pre-0c hook.**

### 3.5 Test strategy planning

**Decision: REJECT as a Wave 0 stage; OUT-OF-SCOPE for Wave 0.**

**Rationale:** Test strategy IS already structurally planned — Wave 2 subsystem specs include "Test Strategy" sections (see orchestrate.ts:373-374, the Tier 2 prompt explicitly asks for "Test Strategy"); Wave 6.2 (§11.5-P2, planned for v1.3.0-dev) generates and runs tests. Pre-empting it in Wave 0 would either duplicate Wave 2 or create a fourth source of test guidance, both of which violate §15 (canonical state) at the per-project level.

The "test strategy planning" the brief mentions is what Wave 0₀ surfaces if the requirements imply unusual test needs (e.g. "must have formal verification" or "must achieve >95% mutation score") — but that's an NFR, captured in Wave 0₀, not a separate stage.

### 3.6 Threat modeling stage

**Decision: REJECT as a Wave 0 stage; ACCEPT as a Wave 0b sub-prompt augmentation when regulatory or security flags appear in Wave 0₀.**

**Rationale:** Threat modeling is most valuable when it has system context to model against. Pre-architecture threat modeling is generic ("watch out for SQL injection") and adds noise. Post-architecture threat modeling (which §10 review agents + Wave 6.4 already do) has the architecture to bite into and produces actionable findings.

The Wave 0 hook: if Wave 0₀ surfaces `regulatory: HIPAA|SOC2|FedRAMP|PCI-DSS`, Wave 0b's Phase 3 (gap surfacing) gets an additional prompt block instructing it to enumerate threat surfaces specific to that regulatory regime. This is a 2-3 line prompt addition, not a stage.

### 3.7 Data architecture stage (schemas, data flows, retention, privacy)

**Decision: REJECT as a standalone stage; partial coverage by Wave 0b's `components_sketch` + Wave 4 (Integration) + Wave 5 (Artifacts).**

**Rationale:** Data architecture at the per-schema level is Wave 3/4's job (component specs define schemas, integration spec defines cross-component types). Data architecture at the system level (where does data live? cloud blob? embedded SQLite? on-disk file? streaming-only?) is captured implicitly in Wave 0b's `selected_style` (e.g. event-driven implies a queue/log; cli-tool implies stdio; library implies caller-owned). Spelling it out as its own stage adds noise.

**Caveat:** if Wave 0₀ surfaces an explicit data-residency constraint (e.g. "data must stay in EU"), Wave 0b's `selected_style` rationale must address it. That's a prompt augmentation, not a stage.

### 3.8 Observability planning (metrics, logs, traces)

**Decision: REJECT as a Wave 0 stage; ACCEPT as a Wave 6.6 (polish sub-wave) concern.**

**Rationale:** Observability instrumentation is a per-component decision, not a system-level one. Pre-architecture observability planning produces generic recommendations ("emit logs") that the LLM does by default in Wave 6.0 anyway. Post-architecture observability scoring (does the component emit metrics for hot-paths? are error paths logged? are spans named consistently?) is Wave 6.6's job per §11.1.

The Wave 0 hook: if Wave 0₀ surfaces an SLA constraint (e.g. "p95 < 100ms"), it becomes an NFR that flows to Wave 6.5 (performance gate) — no new Wave 0 stage needed.

### 3.9 Failure-mode analysis (FMEA-style)

**Decision: REJECT as a standalone stage; ALREADY PRESENT in Wave 0b's `n_order_trace` + `gaps_surfaced`.**

**Rationale:** FMEA is literally what `n-order-effects.md` is. Wave 0b already runs it. Naming the same activity twice with different methodology labels (FMEA vs n-order) doubles the cost. The Wave 0b prompt explicitly asks for failure-mode enumeration via the n-order trace.

### 3.10 Compliance mapping (regulations applicable, where they bite)

**Decision: ACCEPT, MERGED into Wave 0₀.**

**Rationale:** Compliance applicability ("does HIPAA apply?", "is PII collected?", "is PCI in scope?") is a question David must answer; the LLM cannot infer this from requirements alone (false negatives lethal, false positives expensive). Wave 0₀ asks. Output flows into the augmented requirements; Wave 0b's threat-modeling hook (per §3.6) consumes the answer.

No new stage. The Wave 0₀ prompt has a regulatory section.

### 3.11 "Build vs buy vs OSS" decision stage (per §9.5)

**Decision: ACCEPT, MERGED into Wave 0b's Phase 2 prompt augmentation.**

**Rationale:** Per kernel §9.5 ("Leverage OSS, Don't Reinvent"), before any "custom logic" we should check for vetted OSS. At the architecture level, this means: when Wave 0b's components_sketch is being drafted, the prompt should explicitly ask the LLM to consider "does this component exist as a maintained OSS library that we should depend on instead of writing"?

Not a separate stage. A prompt augmentation. The LLM call is the same; the cost difference is ~200 prompt tokens. The output is: components are tagged `{build, buy, oss-dep}`, and `oss-dep` components emit a `vendor_recommendation` field instead of a full implementation spec in later waves.

**Caveat:** the LLM is bad at *current* OSS recommendations (knowledge cutoff). Output should be flagged "verify via context7/WebSearch before depending on" — the next-step automation, not part of Wave 0.

### 3.12 Hardware-target characterization

**Decision: ACCEPT as MUST-HAVE, slot as Wave 0a₂ — between Wave 0a (language) and Wave 0b (architecture).**

**Rationale:** This is the strongest case after Wave 0₀ for a dedicated stage. The target hardware materially affects:
- Wave 0a's `runtime_fit` and `deployment_target_fit` axes (already noted as accepting `hardwareTarget?: HardwareTarget` input).
- Wave 0b's architectural style choice (embedded target → no microservices; serverless target → no long-lived workers; on-prem k8s → no managed services).
- Wave 0c's `cost`, `performance`, and `portability` axes.

Without it, Wave 0c is scoring `cost` against an imaginary hardware target. Garbage in, garbage out.

**Output:** `.spec2/wave-0/hardware-target.json`:
```jsonc
{
  "primary_target": "linux-x86_64-cloud-vm" | "linux-arm64-embedded" | "wasm-browser" | "wasm-edge" | "darwin-x86_64-desktop" | "darwin-arm64-desktop" | "windows-x86_64-desktop" | "linux-cuda-gpu" | "serverless-aws-lambda" | "serverless-cloudflare-workers" | "<custom>",
  "memory_envelope_mb": <int>,
  "cpu_cores": <int> | "elastic",
  "power_envelope_watts": <int> | null,
  "network_assumed": "always-on" | "intermittent" | "offline-first" | "none",
  "storage_envelope_gb": <int> | "elastic",
  "deployment_model": "binary" | "container" | "serverless" | "library" | "browser-bundle",
  "compliance_residency": "us" | "eu" | "any" | "<jurisdiction>",
  "rationale": "<≤300 chars>"
}
```

The fields are mostly user-supplied via Wave 0₀ (if not in the original requirements). The LLM can default reasonable values for missing fields (linux-x86_64-cloud-vm if web service; binary if cli; etc.) but every default is flagged in the rationale.

**Sequencing:** runs *after* 0a because language constrains hardware (e.g. Rust-on-WASM is fine, Python-on-WASM is not). Runs *before* 0b because architecture depends on it.

**Stage name:** **Wave 0a₂ — Hardware Target Characterization.** Subscript notation keeps it visually attached to 0a since they're tightly coupled — language + hardware together form the deployment-platform decision.

### 3.13 Final Wave 0 stage list (the answer)

After §3.1-3.12, the final list of Wave 0 stages is:

| Stage | Name | Rationale source | Wraps which §3.X items |
|-------|------|-----|------|
| **0₀** | Requirements Clarification + NFR Elicitation + Compliance Mapping | §3.1 + §3.2 + §3.10 + §3.7-caveat | Includes regulatory flag, data-residency, accessibility, perf-SLA, ambiguity questions |
| **0a** | Optimal Language Selection | §2.1 | David-requested |
| **0a₂** | Hardware Target Characterization | §3.12 | New must-have stage |
| **0b** | Optimal Architecture (with meta-thinking gap detection + threat hook + build/buy/OSS tagging) | §2.2 + §3.6 + §3.11 | David-requested, augmented with OSS + threat hooks |
| **0b-cost** | Pipeline Cost Estimate (deterministic, not a stage but a hook) | §3.4 | Deterministic computation, pauses for user if > threshold |
| **0c** | Recursive Actor-Critic to Pareto-Frontier | §2.3 | David-requested |

Rejected (per §3): standalone stages for Risk (§3.3 → merged), Test Strategy (§3.5 → out-of-scope), Threat Modeling (§3.6 → hook), Data Architecture (§3.7 → covered downstream), Observability (§3.8 → Wave 6.6), FMEA (§3.9 → present in 0b), Build/Buy/OSS (§3.11 → hook).

**Count:** 4 LLM-driven stages (0₀, 0a, 0b, 0c) + 1 deterministic stage (0a₂ mostly user-supplied + LLM defaults) + 1 deterministic hook (0b-cost). This is tight. The principle: catch upstream what *only* surfaces by being asked or by enumerating; defer everything else.

---

## 4. Integration with existing pipeline

### 4.1 Artifact flow into Wave 1

Wave 1's existing inputs (orchestrate.ts:243-283): `requirements: string`. Post-Wave 0 inputs to Wave 1:

| Existing input | Replaced by | Source artifact |
|-----------------|--------------|------------------|
| `requirements` (raw) | `augmentedRequirements` (Wave 0₀ output: original + clarifications + NFRs + compliance) | `.spec2/wave-0/requirements-augmented.md` |
| (no language input to Wave 1) | `language` is locked at orchestrator entry, but Wave 1 prompt gains a "for context, the language is X" line | `.spec2/wave-0/language-selection.json` |
| (no architecture hint) | `architectureSketch` (Wave 0c's `final_architecture` — read-only NFR-style context, same shape as how `systemSpec` becomes read-only NFR context for Wave 3) | `.spec2/wave-0/architecture-final.json` |
| (no hardware target) | `hardwareTarget` block in the prompt (informational only — Wave 1 still produces a system spec, just constrained by HW) | `.spec2/wave-0/hardware-target.json` |

Wave 1's prompt structure (replacing orchestrate.ts:244-283):

```
[REQUIREMENTS (augmented per Wave 0₀)]
<augmentedRequirements>

[LANGUAGE (locked by Wave 0a)]
Primary: <primary>. Secondary: <secondary | "none">.

[HARDWARE TARGET (locked by Wave 0a₂)]
<one-paragraph summary of hardware-target.json>

[ARCHITECTURE SKETCH (advisory — Wave 0c output, NOT a design target)]
The Wave 0 architecture sketch identified <N> components and selected the <style> style.
You SHOULD honor this decomposition unless you find a concrete reason not to. If you
diverge, document why in the rationale section.
<components_sketch as bullet list>

[YOUR TASK]
<existing task spec from orchestrate.ts:251-282>
```

Critical: the architecture sketch is **advisory, not binding**. Wave 1 is allowed to add/remove/rename components if it has good reason — Wave 1's validator and the post-Wave-0 review will catch unjustified divergence. The Wave 0 sketch is a starting point, not a contract. This preserves the §1.3 invariant (cross-spec alignment is post-generation): Wave 0c→Wave 1 is *upstream-to-downstream* one-way flow, not bidirectional.

### 4.2 Orchestrate.ts dispatch insertion

The brief requires line-number-grounded integration. Current `orchestrate.ts` structure (read 2026-06-01, file is 863 lines):

| Location | Content |
|----------|---------|
| Lines 1-55 | Imports + interface declarations + `MAX_REGENERATION_ATTEMPTS = 3` |
| Lines 57-95 | `safeGenerateReview` + `Ctx` interface |
| Lines 97-138 | `newCtx`, `ctxFromCheckpoint` (idempotent) |
| Lines 140-170 | `rebuildRegistry` |
| Lines 172-190 | `orchestrateSpec2` entry point — currently calls `runWave1..6` directly |
| Lines 192-229 | `orchestrateSpec2FromCheckpoint` — switch on checkpoint.phase, restart at next wave |
| Lines 231-328 | `runWave1` |
| (… etc through Wave 6 …) | |

**Insertion plan:**

1. **New file `skills/spec2/waves/wave0.ts`** — exports `runWave0(ctx): Promise<void>` containing the four sub-functions `runWave0_0`, `runWave0a`, `runWave0a2`, `runWave0b`, `runWave0c` and the deterministic cost-estimate hook. Same shape as Wave 1's existing `runWave1(ctx)` function. Keeps orchestrate.ts itself focused on dispatch.

2. **Edit `orchestrate.ts:18-32`** (the import block) — add:
   ```ts
   import { runWave0 } from './waves/wave0.js';
   ```
   Single line. No other import changes.

3. **Edit `orchestrate.ts:83-95`** (the `Ctx` interface) — extend with Wave 0 outputs:
   ```ts
   interface Ctx {
     requirements: string;                  // existing — raw requirements
     augmentedRequirements?: string;        // NEW — Wave 0₀ output
     language: string;                       // existing — but now POPULATED by Wave 0a unless caller pins
     languagePin?: string;                   // NEW — caller's pin if any (preserves old contract)
     secondaryLanguage?: string;             // NEW — Wave 0a polyglot output
     hardwareTarget?: HardwareTargetJSON;    // NEW — Wave 0a₂ output
     architectureSketch?: ArchitectureFinalJSON;  // NEW — Wave 0c output
     wave0Complete: boolean;                 // NEW — gates Wave 1 entry
     // ... existing fields unchanged ...
   }
   ```

4. **Edit `orchestrate.ts:97-111`** (`newCtx`) — initialize new fields:
   ```ts
   function newCtx(requirements: string, language: string): Ctx {
     return {
       requirements,
       language,                  // becomes the languagePin if Wave 0a is off; otherwise replaced
       languagePin: language || undefined,
       wave0Complete: false,
       // ... existing fields ...
     };
   }
   ```

5. **Edit `orchestrate.ts:176-190`** (the `orchestrateSpec2` entry function). Current file structure (verified 2026-06-01 against orchestrate.ts head):
   - Line 180: `console.log('\n🔷 PHASE 1: Specification Generation\n');`
   - Line 181: `const ctx = newCtx(requirements, language);`
   - Line 182: `console.log('📁 Initialized project structure at .spec2/\n');`
   - Line 183: (blank)
   - Line 184: `await runWave1(ctx);`

   **Insert Wave 0 dispatch between line 183 (blank line after the "Initialized..." log on line 182) and line 184 (`await runWave1(ctx);`).** Also relocate the existing `PHASE 1` log down so it follows Wave 0:
   ```ts
   export async function orchestrateSpec2(
     requirements: string,
     language: string
   ): Promise<BuildResult> {
     console.log('\n🔷 PHASE 0: Pre-Wave-1 Planning\n');  // NEW — replaces the existing PHASE 1 log on line 180; PHASE 1 log moves below
     const ctx = newCtx(requirements, language);
     console.log('📁 Initialized project structure at .spec2/\n');

     await runWave0(ctx);   // ← INSERTED AT (new) LINE 184
     // wave0Complete is now true; ctx.augmentedRequirements + ctx.architectureSketch populated

     console.log('\n🔷 PHASE 1: Specification Generation\n');  // RELOCATED from current line 180 — now post-Wave-0
     await runWave1(ctx);
     await runWave2(ctx);
     // ... unchanged from here ...
   }
   ```
   This is the "insert between line 183 and line 184" point the brief required (plus a one-line relocation of the existing PHASE 1 banner so log ordering matches phase order).

6. **Edit `orchestrate.ts:196-228`** (`orchestrateSpec2FromCheckpoint`) — extend the switch to handle Wave 0 phases. Add cases BEFORE the existing `case 'wave1':`:
   ```ts
   switch (checkpoint.phase) {
     case 'wave0_0':   await runWave0_partial(ctx, 'after-0_0'); /* falls through to wave1 etc */ break;
     case 'wave0a':    await runWave0_partial(ctx, 'after-0a');  break;
     case 'wave0a2':   await runWave0_partial(ctx, 'after-0a2'); break;
     case 'wave0b':    await runWave0_partial(ctx, 'after-0b');  break;
     case 'wave0c':    /* fall through to Wave 1 — Wave 0 is complete */ break;
     case 'wave1':     /* existing — unchanged */ break;
     // ... rest unchanged ...
   }
   ```
   Sequential resume from any Wave 0 substage. Idempotent — same pattern as the existing wave1→wave6 resume.

7. **Edit `orchestrate.ts:55`** — no change to `MAX_REGENERATION_ATTEMPTS = 3`; Wave 0 stages use the same retry count.

8. **Edit `skills/spec2/utils/checkpoint.ts`** (not read in this session — owner will add):
   - Extend `Checkpoint['phase']` enum to include `'wave0_0' | 'wave0a' | 'wave0a2' | 'wave0b' | 'wave0c'` before existing `'wave1'`.
   - Extend the `Checkpoint` interface to include the new optional fields from `Ctx`.

9. **Total edit footprint:** ~30 lines of diff across orchestrate.ts (one import, one new field cluster in Ctx, one new function call, one resume-switch extension); ~10 lines in checkpoint.ts; one new file (`waves/wave0.ts`, expected ~400 LOC when implemented). Net: very small surgical addition to orchestrate.ts.

### 4.3 Checkpointing — Wave 0 checkpoint shape

Wave 0 outputs are checkpointed after each substage so `/spec2-resume` can pick up mid-Wave-0. Five checkpoint phases added: `wave0_0`, `wave0a`, `wave0a2`, `wave0b`, `wave0c`. Each substage calls `saveCheckpoint({ phase: 'wave0<x>', ... })` on success (same shape as Wave 1's call in orchestrate.ts:320-327).

Resume semantics: `ctxFromCheckpoint` reads `.spec2/wave-0/*.json` files if the checkpoint phase indicates Wave 0 progress, deserializes into the new Ctx fields. Same pattern as `componentSpecs` map deserialization in orchestrate.ts:115. No new infrastructure — extends existing checkpoint dispatch.

### 4.4 Integration Registry — does Wave 0 add to it?

**Decision: NO. Wave 0 uses its own `.spec2/wave-0/` directory; the Integration Registry stays Wave-3-populated.**

**Rationale (per ROADMAP §1.5):** the Integration Registry is "a queryable form of validated Tier 3 component specs." It's keyed on component name + subsystem + spec text. Wave 0c's `components_sketch` is a *sketch*, not a finalized component spec — it has names but no function signatures, no types, no exports. Putting sketches into the registry would either (a) pollute the registry with non-public surface entries that Tier 4 then misreads as authoritative, or (b) force a "sketch vs final" distinction in the registry schema that's complexity without payoff.

Wave 0 outputs live in `.spec2/wave-0/`:
```
.spec2/
├── checkpoints/
│   └── latest.json
├── wave-0/                                   ← NEW
│   ├── requirements-augmented.md
│   ├── requirements-clarifications.json      ← Wave 0₀ Q&A log
│   ├── language-selection.json
│   ├── language-selection.md
│   ├── hardware-target.json
│   ├── architecture.json                     ← Wave 0b output
│   ├── architecture.md
│   ├── architecture-final.json               ← Wave 0c output
│   ├── architecture-final.md
│   ├── pareto-frontier.json                  ← Wave 0c full log
│   ├── pipeline-cost-estimate.json
│   └── wave-0-summary.md                     ← human-facing review package
├── registry.db                                ← unchanged; still populated at Wave 3
├── review/
│   ├── system.md
│   ├── subsystem-*.md
│   ├── ... existing tier reviews ...
│   └── wave-0.md                              ← NEW: combined Wave 0 review
└── ... existing structure ...
```

This keeps Wave 0 outputs auditable independently and avoids contaminating the registry's role (public-surface index of finalized components).

### 4.5 Review package integration

Wave 0 outputs flow through the existing review-package shape (`safeGenerateReview` in orchestrate.ts:61-76). One new entry: `wave-0.md` combining the requirements-augmented document, the language rationale, the hardware target, the architecture-final block, and the pareto frontier summary. Generated at Wave 0c completion, before Wave 1 starts. Failure to generate is non-fatal (same contract as existing review packages — see the wrapper logic).

---

## 5. Token-cost analysis

### 5.1 Per-stage estimates

LLM calls per substage (input + output tokens, conservative high estimates). **v1.1 note:** prior-version "max-iter ceiling" numbers removed — Wave 0b Phase 3 and Wave 0c are now unbounded with convergence-based termination (§2.2.6 + §2.3.6). Costs below show steady-state + adversarial-deep ranges; stuck-detection (§2.5) caps adversarial cases.

| Substage | Calls (steady-state) | Calls (adversarial-deep) | Input tok / call | Output tok / call | Total tok (steady) | Total tok (deep) | Notes |
|-----------|-------|-------|------------------|---------------------|------------|------------|--------|
| 0₀ Requirements clarification | 1 (+ N user-response loops) | 1 + 3 | 1.5K | 1K | 2.5K | 8.5K | If user-iter, +~2K per round; cap 3 rounds |
| 0a Language selection | 1 | 1 | 1.5K | 0.8K | 2.3K | 2.3K | |
| 0a₂ Hardware target | 1 | 1 | 1.2K | 0.6K | 1.8K | 1.8K | Mostly defaults if user-supplied |
| 0b Phase 1 + Phase 2 | 2 | 2 | 2K | 1.5K | 7K | 7K | Frame selection + arch proposal |
| 0b Phase 3 (n-order + meta-check loop, v1.1) | 1 + 1 (meta) | 4 + 4 (meta) | 2K avg | 1.5K avg | 7K | 28K | Per §2.4 post-n-order meta-check; loop until meta returns zero gaps |
| 0b Phase 3 loops (if invalidation) | 0-2 reruns | 4-8 reruns | same | same | 0-14K | 28-56K | Per §2.2.4 v1.1; bounded by stuck-detection not numeric cap |
| 0c Actor-critic + meta-check (per outer iter) | 3 | 3-5 (with inner meta loop) | 2.5K avg | 1.5K avg | 12K / iter | 12-20K / iter | Actor + critic + post-n-order meta-check; inner meta-loop on gap surface |
| 0c total (steady, 3-5 outer iters) | 9-15 | — | | | 36-60K | — | Expected steady state on well-shaped requirements |
| 0c total (adversarial-deep, 8-15 outer iters before stuck-detection or threshold) | — | 24-75 | | | — | 96-300K | Worst-case before §2.5 stuck-detection rail fires |
| **Wave 0 total (steady-state)** | **~17-23** | — | | | **~56-90K** | — | Expected steady state |
| **Wave 0 total (adversarial-deep)** | — | **~40-90** | | | — | **~150-400K** | Bounded by stuck-detection + cost-soft-warning; not a numeric cap |

### 5.2 ROADMAP §11.3 comparison

ROADMAP §11.3 expects the §11 quality pipeline to be ~1.3–1.8× baseline cost per component when generation is good, up to 4-5× when many regens fire. Baseline v1.2.0 cost per component (Wave 6.0 + maybe 1 regen) is ~10-15K tokens per component, so a 5-component system at v1.3.x quality is roughly 50-100K × 1.5 = ~75-150K tokens for the quality sub-waves alone, on top of Waves 1-5.

Wave 0 adds ~25-57K tokens **per build, not per component**. For a 5-component system this is ~20-40% overhead relative to the quality pipeline. For a 20-component system the overhead drops to ~5-15% relative — Wave 0 is a fixed-cost amortized across all components.

### 5.3 Net effect — does Wave 0 pay for itself?

Conservatively: Wave 0 pays for itself if it prevents **one** Wave-6-level regeneration cascade per build. A regeneration cascade is a Wave 6 component that has to be regenerated 3 times (the §11 hard cap) because the architecture was wrong; that's ~30-40K tokens of pure waste before failure. Wave 0c's pareto check is exactly designed to surface architecture-shape problems before they cost Wave 6 regenerations.

Threshold rough-math: ROADMAP §11.6 sets `max-regen-attempts per sub-wave: 3`. Each regen attempt in Wave 6 is ~10-15K tokens. Three regens × ~12K tokens = ~36K tokens. So Wave 0's steady-state cost (~56-90K tokens) is in the range of 1-2 saved 3-regen cascades. Worst-case Wave 0 cost (~150-400K with adversarial-deep meta-looping) is at the break-even of 4-10 saved cascades. Empirically, expect Wave 0 to be net-positive on tokens for systems with ≥3 components on well-shaped requirements; for ill-shaped requirements, stuck-detection fires early and surfaces the gap before token waste.

**v1.1 cost-discipline shift:** the v1.0 design treated Wave 0c's cost as a hard cap (MAX_ITER=5 → ~40K tokens). The v1.1 unbinding shifts cost from "capped" to "convergence-managed." The §3.4 cost-soft-warning hook + §2.5 stuck-detection rail collectively bound adversarial-deep cases without bounding optimization quality on legitimate cases. Founder direction (verbatim): "let it loop until it finishes." The cost of one Wave-6 regen cascade exceeds the cost of unbounded Wave 0 optimization on every well-posed problem we've seen.

For systems with ≤2 components: Wave 0 is overhead. Consider gating Wave 0 behind a `wave0: true | false | "auto"` flag on the orchestrator entry point, where `"auto"` runs Wave 0 only when requirements length exceeds a threshold (e.g. 1000 chars) — an indirect proxy for "system complex enough to benefit from upfront planning." Default: `"auto"`. See §7 Open Decision 1.

### 5.4 Latency cost

LLM call latency in the existing pipeline is the dominant wall-clock factor (each Anthropic call: ~5-15s; Groq: ~2-5s; OpenRouter routes vary). 17-23 LLM calls in steady-state Wave 0 at ~7s avg = ~2-3 minutes of added wall-clock per build. Adversarial-deep cases (40-90 calls) = ~5-10 minutes added wall-clock — surfaces as the cost-soft-warning trigger so user can intervene. Acceptable; Wave 1-6 already cost minutes to hours depending on system size, and the adversarial-deep case is precisely the scenario where the design *should* take longer to nail down.

---

## 6. Three-tool integration impact (planning MCP, RNOP)

### 6.1 Planning MCP write-back (CompanyOS `plan_add_decision`, `plan_add_constraint`)

Per ROADMAP §11.4 the three-tool contract is: planning → spec2 (plan flows in as decisions/constraints), spec2 → planning (codegen-forced decisions flow out). Wave 0 extends this earlier in the pipeline.

**Wave 0 reads from planning (if a plan exists and is linked):**
- If `ctx.planId` is set (caller passed a plan to operate against), Wave 0₀'s clarification step calls `plan_get_focus(planId)` and `plan_get_constraints(planId, affects=["codegen","architecture"])` via MCP. Constraints flagged `affects: architecture` are merged into the augmented-requirements doc.
- This makes Wave 0 a *plan-consumer* in addition to a plan-producer.

**Wave 0 writes back to planning:**
- After Wave 0a completes: `plan_add_decision(planId, { kind: "language-selection", primary, secondary, rationale, affects: ["codegen","testing","deployment"], source: "spec2-wave-0a" })`.
- After Wave 0a₂: `plan_add_constraint(planId, { kind: "hardware-target", target, residency, deployment_model, affects: ["architecture","performance","cost"], source: "spec2-wave-0a2" })`.
- After Wave 0b: `plan_add_decision(planId, { kind: "architecture-style", style, frame, gaps_blocking: [...], affects: ["all"], source: "spec2-wave-0b" })`.
- After Wave 0c: `plan_add_decision(planId, { kind: "pareto-selected-architecture", frontier_size, selected_id, weights_used, affects: ["all"], source: "spec2-wave-0c" })`.

**Contract enforcement:**
- All writes are conditional on `ctx.planId != null` — Wave 0 still runs without a linked plan; planning integration is opt-in (preserves the "spec2 has no runtime dependency on CompanyOS" invariant from `spec2_companyos_integration.md`).
- Decisions are tagged with `source: "spec2-wave-0X"` so planning's audit log can attribute origin.
- `affects: ["all"]` for architectural decisions because they touch every downstream wave.
- Wave 0 NEVER edits decisions written by another source (planning's decisions are immutable from spec2's side per §11.4 contract).

**Failure modes:**
- Planning MCP unavailable → log warning, continue. Wave 0 outputs still get written to `.spec2/wave-0/`. The planning sync becomes a deferred operation; surface in the build report.
- `plan_add_decision` rejects (e.g. plan is locked, decision conflicts with existing) → log + surface to user. Wave 0 build continues — David sees the conflict in the build report and decides if it's load-bearing.

### 6.2 RNOP integration

Wave 0 does NOT integrate with RNOP. Rationale: RNOP (per ROADMAP §11.4) is the "max-regen-attempts exhaustion handler" — it produces patch philosophy when Wave 6 sub-waves give up. Wave 0 doesn't regenerate, doesn't exhaust attempts. The structural-reasoning role RNOP plays in Wave 6 has no analogue in Wave 0 (Wave 0 isn't fixing failed code; it's planning).

If Wave 0c plateaus without reaching the threshold, the *correct* response is to surface to the user (per `loop-convergence.md`), not to call RNOP. Surfacing keeps the human in the loop on architectural decisions, which is the right place for human judgment.

---

## 7. Constraint compatibility + open decisions

### 7.1 §1.1 isolation contract — preserved, with explicit caveats

The agent-isolation contract says each fresh LLM call sees only its scoped slice. Wave 0 preserves this with explicit care:

- **Wave 0a's LLM call** sees: requirements + `availablePacks` (deterministic). No Wave 0b/0c outputs (they don't exist yet).
- **Wave 0a₂'s LLM call** (if any — mostly user-supplied) sees: language choice + requirements section relevant to deployment.
- **Wave 0b Phase 1** (frame selection) sees: requirements + language + hardware target. No prior frame history. Fresh agent every build.
- **Wave 0b Phase 2** (architecture proposal) sees: requirements + language + hardware target + LOCKED frame. **Critical:** it does NOT see Phase 1's discarded frames (other than the optional near-miss nudge from Gap 0b-A mitigation). Fresh agent.
- **Wave 0b Phase 3** (gap surfacing) sees: requirements + language + hardware target + final frame + final architecture. **It does NOT see Phase 1's discarded frames or Phase 2's discarded styles.** Fresh agent. This is exactly the §1.1 pattern — Phase 3 is the validator-shape role, fed the artifact to audit, not the deliberation that produced it.
- **Wave 0c actor** sees: requirements + language + hardware target + the current frontier (architecture deltas, NOT critic comments). The actor does NOT see prior critic feedback verbatim — it sees the implicit signal of which axis is weakest. This prevents the actor from anchoring on "the critic said X is bad, so don't propose anything like X."
- **Wave 0c critic** sees: the actor's candidate + the frontier + the 7 axes definition. The critic does NOT see prior critic comments from earlier iterations on different candidates. Fresh-agent-per-candidate.

**Tension surfaced:** Wave 0c's actor seeing the frontier is structurally similar to Wave 4's generator seeing all component specs (orchestrate.ts:638-647). Both are sibling-visibility within a wave — but the §1.1 contract permits this for Wave 4 because integration is by definition cross-spec. Same logic applies: Wave 0c's job IS to compare candidates, so cross-candidate visibility is the job, not a violation.

**No new contamination surface introduced.** Wave 0 → Wave 1 flow follows the same `SYSTEM CONTEXT (read-only, DO NOT design from this directly)` pattern that orchestrate.ts:498-504 already uses for the system spec going into Wave 3.

### 7.2 §1.3 wave-alignment-is-post-generation — preserved

The §1.3 invariant is: cross-spec overlap detection runs AFTER all specs at a wave are generated. Wave 0 does not violate this:

- Wave 0a's language selection is monadic (one output, no cross-spec). N/A.
- Wave 0a₂ is monadic. N/A.
- Wave 0b's three phases produce ONE architecture. No siblings. The "Phase 3 invalidates Phase 2" check is *intra-wave alignment*, not cross-spec — it's a frame-vs-architecture coherence check, structurally distinct from the wave-alignment check at Waves 2 and 3 (which compare *different specs at the same tier*).
- Wave 0c is the explicit cross-candidate comparator — but at the Wave 0 level, there's only one architecture (Wave 0b's). The "candidates" Wave 0c compares are *the same architecture under different optimization deltas*, not different architectures at the same tier. Same isolation argument as Wave 0b above.

**No tension; no resolution needed.**

### 7.3 §1.5 checkpoint-is-rehydration-not-prompt — preserved

Wave 0's checkpoint additions (`.spec2/wave-0/*.json` files + new phase enum values) follow the same pattern as existing tiers: checkpoint is a serialized snapshot of `Ctx`, used only for rehydration on resume. No LLM ever sees the checkpoint. Implementation-mechanical extension; no invariant change.

### 7.4 ROADMAP §11.6 locked constraints — preserved

§11.6 sets max-regen-attempts per sub-wave at 3 and forbids silent passes. Wave 0 honors both:
- Each Wave 0 substage has a max-3-attempt regen cap (mirrors existing Waves 1-6).
- No Wave 0 stage silently passes — every output is JSON-validated and surfaces to the review package.

### 7.5 Open decisions David must own before implementation

These are the calls I can't make without input. Each has a recommended default and a trigger condition for revisiting.

1. **OPEN DECISION 1 — Wave 0 default-on / default-off / auto?**
   - Options: (a) Always run Wave 0; (b) Default-off, opt-in flag; (c) Auto (run only if requirements >1000 chars).
   - **My recommendation:** (c) auto, with explicit override. Auto threshold tunable.
   - **Trigger to revisit:** if usage shows Wave 0 firing on trivial builds (overhead) OR not firing on builds that need it (regressions), flip to (a).

2. **OPEN DECISION 2 — Threshold for paused-on-cost in 0b-cost hook (§3.4)?**
   - Options: (a) $5 default; (b) $20 default (less interruptive); (c) no threshold (never pause, always log).
   - **My recommendation:** (a) $5 with override env var `SPEC2_COST_PAUSE_THRESHOLD_USD`. §1.10 makes runaway burn the worst outcome.
   - **Trigger to revisit:** when revenue lands and budget is no longer the constraint.

3. **OPEN DECISION 3 — Polyglot output support?**
   - Wave 0a can emit `secondary != null` (e.g. Go + Python). Wave 6 currently emits one file per component. Supporting polyglot requires Wave 6 to emit per-language files and Wave 4's integration spec to define cross-language interfaces.
   - Options: (a) Polyglot supported in v1.5.0-dev; (b) Wave 0a flags polyglot need but errors out (single-language only for v1.5.0; polyglot deferred to v1.6.0); (c) Wave 0a forbidden from proposing polyglot.
   - **My recommendation:** (b) flag-but-error for v1.5.0-dev. Polyglot is a large Wave 6 change; keep Wave 0 small initially. Surface polyglot need as a known-unbuildable, deferred to v1.6.0.
   - **Trigger to revisit:** when a real project needs polyglot AND Wave 6 has shipped a polyglot codegen pathway.

4. **OPEN DECISION 4 — Pauses for user input in Wave 0₀ and Wave 0a (suboptimal-pin)?**
   - Wave 0 is the first phase where the pipeline genuinely benefits from asking the user a question (clarification, suboptimal-pin override). Today the pipeline is fully non-interactive. Two options:
     - (a) Interactive: Wave 0₀/0a pause and write a `.spec2/wave-0/user-question.json` file; orchestrator throws a special `UserInputRequired` error caught by the MCP/HTTP transports; transports surface to the user; user resumes with answers.
     - (b) Non-interactive only: Wave 0₀ asks only via best-effort inference; if ambiguous, log to the review package and continue with assumed defaults.
   - **My recommendation:** (a) interactive, with a `wave0Interactive: true | false` orchestrator flag (default true). The MCP/HTTP transports already have a job-tracking pattern that can model "paused-awaiting-input" cleanly (see `spec2_v1_2_0_dev.md` — jobs.ts uses AsyncLocalStorage; extending it for user-input-pending states is a one-day add).
   - **Trigger to revisit:** if interactive mode causes pipeline stalls in unattended-build scenarios (CI, scripts).

5. **OPEN DECISION 5 — `axes_scored` weights ownership?**
   - Wave 0a and Wave 0c both have axis-weighting decisions. Defaults are baked in (Wave 0a: 7 weights summing to 1.0; Wave 0c: project-priority weights, defaults biased toward solo-founder priorities).
   - Options: (a) Per-build override via `.spec2/wave-0/weights.json` (David edits before build, persists in repo); (b) Per-build override via flag/env var; (c) Hard-coded defaults only, no override.
   - **My recommendation:** (a) per-build file, version-controlled. Aligns with §15 canonical-state discipline (weights are project-authoritative state).
   - **Trigger to revisit:** when a user reports default weights produce bad selections — calibrate from real data.

6. **OPEN DECISION 6 — Should the actor-critic-thinking MCP wire into Wave 0c?**
   - The `actor-critic-thinking` MCP exists and has a typed session-tracking shape. Wave 0c reimplements the loop in-orchestrator (per §2.3.8) because we need pareto-specific termination. Reusing the MCP would mean either (a) extending the MCP with pareto termination (upstream change to a shared tool — not our codebase), or (b) running the MCP loop and post-filtering for pareto — but that loses the per-iter pareto-driven actor focus.
   - **My recommendation:** in-orchestrator implementation (current §2.3 spec). The MCP is referenced as prior art and pattern source, not a runtime dep.
   - **Trigger to revisit:** if the MCP gets a pareto-termination extension upstream, or if Wave 0c implementation pain exceeds 2× the design effort.

---

## 8. Adversarial completion checklist (for the reviewer)

This is the brief's adversarial-completion criteria, with a pointer to where each is satisfied:

1. **Design doc exists at the specified path.** → This file at `/home/tessara/companyos/system/spec2/docs/design/wave-0-planning.md`.
2. **Every numbered section (a-f) present and substantive.** → §2 (a, the 3 stages), §3 (b, gap analysis), §4 (c, integration), §5 (d, token cost), §6 (e, three-tool integration), §7 (f, constraint compatibility).
3. **Accept/reject decision for each candidate stage with rationale.** → §3.1-§3.12, ten explicit decisions. Five accepted (0₀ via 3.1+3.2+3.10, 0a₂ via 3.12, plus three rejected-as-merged: 3.4 partial, 3.6 hook, 3.11 hook), seven rejected or scoped out.
4. **Termination conditions for actor-critic loop are concrete (convergence verdicts, stuck-detection, cost-soft-warning).** → §2.3.6 v1.1: threshold ≥0.85, plateau window=2, PLATEAU_EPS=0 (frontier membership is discrete), cycle-detection via candidate-fingerprint match. **NO numeric MAX_ITER cap** (v1.0 had 5; founder-direction v1.1 removed). Stuck-detection rail at §2.5 prevents infinite loops on un-fixable findings. Cost-soft-warning at §3.4 threshold surfaces depth without halting.
5. **Integration into orchestrate.ts specified at "insert Wave 0 dispatch between line X and line Y."** → §4.2 step 5: insert between current line 183 (`console.log('📁 Initialized...')`) and current line 184 (`await runWave1(ctx);`).
6. **Review-ready: senior architect can approve, request changes, or reject without asking "what did you mean by X."** → Every interface is JSON-schema'd, every algorithm has explicit numeric thresholds, every open decision has a recommended default + trigger to revisit.

**Adversarial trap I avoided (Wave 0b meta layer):** §2.2.7 surfaces 5 gaps in this doc's own Wave 0b design, with mitigations. Meta-thinking was applied to the design itself, not just specified as a stage.

**Adversarial trap I avoided (vague algorithm sketch):** §2.3.5 has pseudocode with explicit termination logic; §2.3.7 defines exactly what an "optimization candidate" looks like as a structured delta + claimed_impact + recomputed scores.

**Adversarial trap I avoided (pareto without defined axes):** §2.3.3 names all 7 axes, defines each, splits LLM-judged vs deterministic computation, and gives the explicit domination predicate.

---

## 9. What this doc does NOT do

- **No code.** All implementation specs are paper. `waves/wave0.ts` does not exist; checkpoint.ts is not edited; orchestrate.ts is not edited. The §4.2 line numbers are insertion plans, not patches.
- **No validator implementations.** The validators referenced (`wave-0a-validator.ts` etc.) are named and contract-defined but not coded.
- **No prompt strings.** Algorithm sketches describe the prompt's *shape* (input blocks, instruction sections) but not the literal text. Prompt engineering is implementation-time work.
- **No tests.** Test plan should follow the existing pack-test pattern (`packs/go/manifest.test.mjs`) but the test files are implementation-time.
- **No CHANGELOG entry, no IMPLEMENTATION_STATUS.md update, no ROADMAP §3 Tier entry.** Those follow if/when the design is approved.

---

## 10. Phasing recommendation

If approved, suggested phased delivery (similar to ROADMAP §8/§9/§11 phasing):

| Phase | Scope | Effort | Target version |
|-------|-------|--------|----------------|
| W0-P0 | Skeleton: `waves/wave0.ts`, checkpoint enum extension, Ctx field additions, orchestrate.ts dispatch. No LLM logic yet — all substages return early with TODO. Validates the integration shape. | 2-3h | v1.5.0-dev entry |
| W0-P1 | Wave 0₀ (requirements clarification + NFR + compliance, interactive paused-state in MCP/HTTP) | 6-8h | v1.5.0-dev |
| W0-P2 | Wave 0a (language selection, deterministic axes from `packs/index.ts`, LLM call for the LLM-scored axes, pin handling) | 4-5h | v1.5.0-dev |
| W0-P3 | Wave 0a₂ (hardware target — mostly user-supplied via 0₀ Q&A, LLM defaults) | 2-3h | v1.5.0-dev |
| W0-P4 | Wave 0b (3-phase meta-thinking + n-order, with v1.1 convergence-based termination + post-n-order meta-check + stuck-detection rail) | 10-13h | v1.5.0-dev |
| W0-P5 | Wave 0c (actor-critic with pareto domination, frontier maintenance, termination) | 10-12h | v1.5.0-dev |
| W0-P6 | Review package (`wave-0.md` combined), planning MCP write-back (`plan_add_decision` after each substage), pipeline cost estimate | 4-5h | v1.5.0-dev |
| W0-P7 | Wave 1 prompt integration (extend with augmented requirements + architecture sketch + hardware target context blocks, preserve advisory-not-binding contract) | 3-4h | v1.5.0-dev |
| W0-P8 | Resume-from-checkpoint support for all Wave 0 substages, integration tests for resume mid-Wave-0 | 3-4h | v1.5.0-dev |

**Total estimated effort:** 42-54 hours across 9 phases. ~1-2 weeks of focused work. Compares to ROADMAP §11's 30-44h for the full §11 quality pipeline — Wave 0 is a similar-scale workstream.

**Sequencing relative to other v1.x work:** Wave 0 is orthogonal to §8 (language packs) and §10 (review agents). It depends on the planning MCP being mature (already shipped — `mcp-server-lite.py` per ROADMAP §11.4). Most natural slotting: v1.5.0-dev as the entry version, post-v1.4.0 (when §11 quality pipeline is complete and the foundation is stable).

**v1.10 alignment:** every Wave 0 phase is justified against time-to-first-revenue. The implicit case: spec2's value prop is "production-quality code without babysitting"; Wave 0 reduces babysitting frequency by catching architectural drift before Wave 6 generates 5,000 lines of wrong-shape code. If David's revenue-priority lens classifies Wave 0 as backlog rather than P0, the whole Wave 0 workstream defers — this doc gets filed and the work is queued behind revenue-direct items.

---

*End of design.*
