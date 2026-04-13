# spec2 Phase A — Final Implementation Plan

**Date**: April 11, 2026
**Status**: Design Complete — Awaiting Approval

---

## Executive Summary

**Original Phase A**: 22 hours → Basic automation
**Final Phase A**: 56 hours → Automation + UX + Quality Assurance

**Three Major Improvements**:
1. **Integration Registry** (+6h) — Solves Tier 4 context overload
2. **Visual Review Package** (+8h) — Solves human review burnout
3. **Verification Checkpoints** (+20h) — Solves AI hallucination & reward hacking

---

## Problem → Solution Summary

| Problem | Solution | Impact |
|---------|----------|--------|
| **Tier 4 loads 120+ pages into one context** | Integration Registry (SQLite) | 12x context reduction |
| **User reads 3-5 hours of dense specs** | Visual Review Package (1-page summaries + diagrams) | 5-10x faster review |
| **20-45% of AI code has hallucinations** | Anti-Hallucination Detection (AST + introspection) | 96% reduction |
| **Hollow tests pass validation** | Anti-Hollow Detection (assertion density, mutation testing) | 90% reduction |
| **All components need human review** | Confidence Scoring & Routing | 60% auto-approved |

---

## Complete Phase A Breakdown

### Original Steps (22 hours)

| Step | Task | Time | Deliverable |
|------|------|------|-------------|
| 1 | Executable skill structure | 4h | TypeScript project setup |
| 2 | Task-based agent launching | 8h | Tier 1-4 agent wrappers |
| 3 | Artifact generation loop | 4h | Gen + audit with fresh contexts |
| 4 | Code gen + validation loop | 4h | One-shot + fix iteration |
| 5 | Integration + testing | 2h | End-to-end workflow |

### New Steps — Integration Registry (6 hours)

| Step | Task | Time | Deliverable |
|------|------|------|-------------|
| 3.5a | SQLite schema design | 1h | Database schema + initialization |
| 3.5b | Metadata extraction agent | 2h | Extract types/functions/dependencies from specs |
| 3.5c | Registry query functions | 2h | Find conflicts, cycles, inconsistencies |
| 3.5d | Revised Tier 4 implementation | 1h | Query registry instead of loading specs |

### New Steps — Visual Review Package (8 hours)

| Step | Task | Time | Deliverable |
|------|------|------|-------------|
| 3.6a | Executive summary generator | 3h | LLM-based 1-page summary extraction |
| 3.6b | Mermaid diagram generator | 4h | Architecture + sequence + data diagrams |
| 3.6c | Review workflow integration | 1h | Modified user approval flow |

### New Steps — Verification Checkpoints (20 hours)

#### Phase 1: Critical (12 hours)

| Step | Task | Time | Deliverable |
|------|------|------|-------------|
| 3.7a | Library introspection utilities | 2h | Python, TS, Go stdlib + package introspection |
| 3.7b | AST-based hallucination detection | 1.5h | Parse imports, function calls, type refs |
| 3.7c | Auto-correction logic | 0.5h | Suggest similar valid APIs |
| 3.8a | Assertion density measurement | 1.5h | Count assertions per test function |
| 3.8b | Mock ratio detection | 1.5h | Count mocks vs real calls |
| 3.8c | Coverage paradox detection | 1h | High coverage + low assertions = hollow |
| 3.9a | Confidence scoring logic | 2h | Combine all metrics, weighted average |
| 3.9b | Routing decision tree | 1h | Route based on confidence thresholds |
| 3.9c | Integration with orchestration | 1h | Wire checkpoints into code gen loop |

#### Phase 2: Advanced (8 hours)

| Step | Task | Time | Deliverable |
|------|------|------|-------------|
| 3.10a | Mutation testing tool wrappers | 2h | Stryker, mutmut, PITest integration |
| 3.10b | Selective execution logic | 1h | Only run on critical/flagged components |
| 3.10c | Score interpretation | 1h | Parse mutation testing output |
| 3.11a | SonarQube integration | 2h | Code quality metrics |
| 3.11b | Semgrep security scanning | 1h | Vulnerability detection |
| 3.11c | Aggregate quality metrics | 1h | Combine complexity, maintainability, security |

### Total: 56 hours

---

## Deliverables

### File Structure

```
~/.claude/skills/spec2-new/
├── skill.ts                      # Entry point
├── orchestrate.ts                # Main orchestration logic
├── agents/
│   ├── tier1.ts                  # System spec generation
│   ├── tier2.ts                  # Subsystem specs (parallel)
│   ├── tier3.ts                  # Component specs (sequential)
│   ├── tier4.ts                  # Integration spec (REVISED: uses registry)
│   ├── artifact.ts               # Artifact gen + audit
│   ├── codegen.ts                # Code gen + fix loop
│   ├── metadata-extractor.ts     # NEW: Extract integration metadata
│   └── review-package.ts         # NEW: Generate summaries + diagrams
├── registry/
│   ├── schema.sql                # NEW: SQLite schema
│   ├── queries.ts                # NEW: Conflict/cycle detection
│   └── analysis.ts               # NEW: Integration analysis
├── verification/
│   ├── anti-hallucination.ts     # NEW: AST + introspection
│   ├── anti-hollow.ts            # NEW: Assertion density, mock ratio
│   ├── confidence.ts             # NEW: Scoring + routing
│   ├── mutation.ts               # NEW: Mutation testing (optional)
│   └── quality.ts                # NEW: SonarQube + Semgrep
├── utils/
│   ├── lock.ts                   # Lock/unlock specs
│   ├── extract.ts                # Extract subsystems/components
│   ├── validate.ts               # 12-layer validation runner
│   └── cache.ts                  # NEW: SHA256-based caching
├── tsconfig.json
├── package.json
└── SKILL.md
```

---

## Expected Outcomes

### Build Time (10-component system)

| Phase | Before | After | Change |
|-------|--------|-------|--------|
| Spec generation | 30 min | 30 min | - |
| Spec verification | 0 min | 2 min | +2 min (automated) |
| Artifact generation | 20 min | 20 min | - |
| Artifact verification | 0 min | 1 min | +1 min (automated) |
| Code generation | 40 min | 40 min | - |
| Code verification | 0 min | 15 min | +15 min (automated) |
| Human review | 200 min | 16 min | **-184 min** |
| **Total** | **290 min** | **124 min** | **-166 min (57% reduction)** |

### Quality Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Hallucination rate | ~20% | ~1% | **96% reduction** |
| Hollow tests | ~30% | ~3% | **90% reduction** |
| Components auto-approved | 0% | 60% | **60% less human review** |
| Average mutation score | Unknown | >80% | **2026 standard** |
| Security vulnerabilities | Unknown | 0 critical | **Zero tolerance** |

### User Experience

| Aspect | Before | After |
|--------|--------|-------|
| Tier 4 context | 120 pages | 10 pages |
| Review per component | 20-30 min (text) | 2-5 min (visual) |
| Confidence in output | Low (no metrics) | High (quantified) |
| Scalability | ~15 components max | 50+ components |
| Trust in system | "Hope it works" | "Know it works" |

---

## Cost-Benefit Analysis

### Development Cost
- **Time investment**: 56 hours (vs 22 hours original)
- **Increase**: +34 hours (+155%)
- **Breakdown**: Registry (6h), Visual (8h), Verification (20h)

### Per-Build Savings (10-component system)
- **Time saved**: 2.7 hours (166 min)
- **Quality improvement**: 70-85% defect reduction
- **Trust improvement**: Quantified confidence scores

### ROI Timeline
- **Break-even**: 13 builds (34h / 2.7h per build)
- **After 20 builds**: +20 hours net savings
- **After 50 builds**: +101 hours net savings

**Plus intangibles**:
- Users will actually use the tool (not avoid it due to pain)
- Enables 3x larger projects (scalability)
- Foundation for future advanced features

---

## Phased Implementation Options

### Option A: All-In (Recommended)
**Implement everything in Phase A (56 hours)**

**Pros**:
- Launch with complete, polished system
- Great first impression
- Users get full benefits immediately

**Cons**:
- Longer time to first release
- Higher upfront investment

### Option B: Phased Rollout
**Phase A**: 36h (automation + UX improvements)
- Steps 1-5: Core automation (22h)
- Step 3.5: Integration Registry (6h)
- Step 3.6: Visual Review Package (8h)

**Phase A.5**: 12h (critical verification)
- Step 3.7: Anti-hallucination (4h)
- Step 3.8: Anti-hollow (4h)
- Step 3.9: Confidence scoring (4h)

**Phase B**: 8h (advanced verification)
- Step 3.10: Mutation testing (4h)
- Step 3.11: Code quality (4h)

**Pros**:
- Faster first release (36h vs 56h)
- Can validate core workflow before adding verification
- Easier to test incrementally

**Cons**:
- Users see incomplete system first
- Risk of negative first impressions if A.5 is delayed
- More deployment overhead

### Option C: Minimum Viable
**Phase A**: 34h (automation + critical verification only)
- Steps 1-5: Core automation (22h)
- Step 3.7: Anti-hallucination (4h)
- Step 3.8: Anti-hollow (4h)
- Step 3.9: Confidence scoring (4h)

**Defer**: Registry, Visual Review, Mutation Testing, Code Quality

**Pros**:
- Fastest path to working system
- Addresses most critical risk (hallucinations)

**Cons**:
- Tier 4 still has context issues
- User review still painful
- Missing advanced quality checks

---

## Recommendation

**✅ Option A: All-In (56 hours)**

**Rationale**:
1. **User Experience**: Without visual review, the tool is too painful to use regularly
2. **Scalability**: Without registry, Tier 4 fails at ~15 components
3. **Quality**: Without verification, 20-45% of output has issues
4. **First Impressions**: Better to launch complete than iterate from bad UX
5. **ROI**: Positive after just 13 builds, excellent long-term

**Alternative**: If time-constrained, Option B (phased) is acceptable, but Phase A.5 must ship within 1 week of Phase A.

**Not recommended**: Option C (minimum viable) — leaves too many pain points.

---

## Dependencies & Prerequisites

### Tools to Install

#### Python
```bash
pip install \
  mutmut \              # Mutation testing
  pytest pytest-cov \   # Test coverage
  ruff mypy radon \     # Code quality
  ast-analyzer          # Hallucination detection (or use stdlib ast)
```

#### TypeScript/JavaScript
```bash
npm install -g \
  stryker stryker-cli \ # Mutation testing
  jest \                # Test framework
  eslint \              # Linting
  @babel/parser         # AST parsing
```

#### Go
```bash
go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
go install golang.org/x/tools/cmd/gotype@latest
```

#### Universal
```bash
# SonarQube (Docker)
docker run -d --name sonarqube -p 9000:9000 sonarqube:community

# Semgrep
pip install semgrep

# Lizard (multi-language complexity)
pip install lizard
```

### Environment Setup
- Node.js 18+ (for TypeScript skill)
- Python 3.10+ (for mutation testing, code quality)
- SQLite 3.35+ (for integration registry)
- Docker (for SonarQube, optional)

---

## Success Criteria

### Phase A is complete when:

**Functional**:
- [ ] `/spec2:new "<requirements>"` fully automated (no manual steps)
- [ ] Tier 4 queries registry (not loading all specs)
- [ ] User reviews visual packages (not 12-page specs)
- [ ] Code verification runs on every component
- [ ] Confidence scoring routes components correctly

**Quality**:
- [ ] Hallucination detection achieves >95% precision
- [ ] Hollow test detection catches tests with <2 assertions/test
- [ ] 50-70% of components auto-approved (confidence >90%)
- [ ] Mutation scores average >75% (target >80%)
- [ ] Build completes with zero hallucinations, zero hollow tests

**Performance**:
- [ ] Total build time <3 hours for 10-component system
- [ ] Human review time <30 min for 10-component system
- [ ] Code verification <2 min per component (excluding mutation testing)

**User Experience**:
- [ ] Review packages are clear and useful
- [ ] Confidence scores are actionable (not opaque)
- [ ] Regeneration provides specific fixes (not vague "try again")

---

## Next Steps

1. **User Approval**: Review this plan and approve Option A, B, or C
2. **Environment Setup**: Install dependencies (1 hour)
3. **Implementation**: Execute steps 1-5 + 3.5-3.11 (56 hours)
4. **Testing**: Build sample 5-component system to validate workflow (4 hours)
5. **Documentation**: Update SKILL.md with capabilities (2 hours)
6. **Launch**: Announce `/spec2:new` is ready

**Total timeline**: ~63 hours (56h implementation + 7h setup/testing/docs)

---

## Open Questions

1. **Phasing preference**: Option A (all-in), B (phased), or C (minimum)?
2. **Mutation testing**: Always run, never run, or selective (flagged components only)?
3. **SonarQube**: Docker installation acceptable, or prefer lighter alternative?
4. **Confidence thresholds**: 90/75/60 for auto/quick/detailed, or adjust?

---

**Status**: Awaiting user approval to begin implementation.

**Documents**:
- [PHASE_A_IMPROVEMENTS.md](PHASE_A_IMPROVEMENTS.md) — Detailed technical design
- [IMPROVEMENTS_VISUAL.md](IMPROVEMENTS_VISUAL.md) — Visual before/after comparison
- [VERIFICATION_CHECKPOINTS.md](VERIFICATION_CHECKPOINTS.md) — Complete verification system design
- [VERIFICATION_INTEGRATION_VISUAL.md](VERIFICATION_INTEGRATION_VISUAL.md) — Workflow integration diagrams
- [SESSION_CONTEXT.md](SESSION_CONTEXT.md) — Original context (pre-improvements)
