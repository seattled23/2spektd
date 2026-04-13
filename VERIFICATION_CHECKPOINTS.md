# spec2 Verification Checkpoint System — Anti-Hallucination & Confidence Scoring

**Date**: April 11, 2026
**Purpose**: Deterministic "bullshit detection" to catch hallucinations, hollow patterns, reward hacking, and malicious compliance

---

## Problem Statement

**Current Risk**: Without deterministic verification, spec2 could generate:
- **Hollow tests**: 100% coverage but 0 real assertions (reward hacking)
- **Hallucinated APIs**: Calls to functions/libraries that don't exist
- **Malicious compliance**: Technically meets spec but defeats intent
- **Graceful degradation**: Quality drops when task gets hard
- **Mock paradise**: Tests pass because everything is mocked, not real behavior

**Industry Data (2026)**:
- [29-45% of AI-generated code contains security vulnerabilities](https://diffray.ai/blog/llm-hallucinations-code-review/)
- [20% of AI package recommendations don't exist](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5610993)
- [AST-based detection achieves 100% precision, 77% auto-correction](https://arxiv.org/abs/2601.19106)
- [Hybrid mitigation achieves 96% hallucination reduction](https://arxiv.org/html/2601.19106v1)

**User's Insight**: "We need deterministic 'is the AI bullshitting right now?' checks, not self-reported confidence."

---

## Solution Architecture

### Three-Layer Defense System

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: SPEC VERIFICATION (Tiers 1-4)                        │
│  ├─ Completeness scoring (all sections present?)               │
│  ├─ Internal consistency (all types defined?)                  │
│  ├─ Testability scoring (criteria measurable?)                 │
│  └─ Integration coherence (contracts align?)                   │
│                                                                 │
│  Output: SpecConfidence (0-100)                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: ARTIFACT VERIFICATION (Phase 2)                      │
│  ├─ Correspondence density (properties → layers)               │
│  ├─ Completeness coverage (% criteria with artifacts)          │
│  ├─ Test specificity (concrete vs vague)                       │
│  └─ Baseline measurability (can we measure it?)                │
│                                                                 │
│  Output: ArtifactConfidence (0-100)                            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: CODE VERIFICATION (Phase 3)                          │
│  ├─ Anti-Hallucination (AST + library introspection)           │
│  ├─ Anti-Hollow (assertion density, mock ratio)                │
│  ├─ Test Quality (mutation testing, coverage paradox)          │
│  ├─ Code Quality (complexity, maintainability)                 │
│  └─ Security (vulnerability scanning)                          │
│                                                                 │
│  Output: CodeConfidence (0-100)                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                   Combined Confidence Score
                   Route based on thresholds
```

---

## Layer 1: Spec Verification

### Completeness Scoring

**What**: Check if all required sections are present in specs.

**Implementation**:
```typescript
interface SpecSection {
  required: string[];  // Must-have sections
  optional: string[];  // Nice-to-have sections
}

const TIER3_REQUIRED_SECTIONS = [
  '## Overview',
  '## Functions',
  '## Data Model',
  '## Error Handling',
  '## Test Requirements',
  '## Acceptance Criteria'
];

async function scoreCompleteness(spec: string): Promise<number> {
  const presentSections = extractSections(spec);
  const requiredPresent = TIER3_REQUIRED_SECTIONS.filter(
    section => presentSections.includes(section)
  );

  return (requiredPresent.length / TIER3_REQUIRED_SECTIONS.length) * 100;
}
```

**Thresholds**:
- 100%: All required sections present → proceed
- 80-99%: Missing some sections → regenerate
- <80%: Major gaps → flag for review

### Internal Consistency Scoring

**What**: Verify all referenced types, functions, and components are actually defined.

**Implementation**:
```typescript
interface ConsistencyCheck {
  undefinedTypes: string[];      // Types referenced but not defined
  undefinedFunctions: string[];  // Functions called but not defined
  cyclicDeps: string[][];        // Circular dependencies
}

async function scoreConsistency(spec: string): Promise<number> {
  // Extract all type references
  const typeRefs = extractTypeReferences(spec);  // e.g., "User", "Token"
  const typeDefs = extractTypeDefinitions(spec);

  const undefinedTypes = typeRefs.filter(ref => !typeDefs.includes(ref));

  // Extract all function calls
  const functionCalls = extractFunctionCalls(spec);  // e.g., "findUser()"
  const functionDefs = extractFunctionDefinitions(spec);

  const undefinedFunctions = functionCalls.filter(
    call => !functionDefs.includes(call)
  );

  const totalRefs = typeRefs.length + functionCalls.length;
  const resolvedRefs = totalRefs - undefinedTypes.length - undefinedFunctions.length;

  return (resolvedRefs / totalRefs) * 100;
}
```

**Thresholds**:
- 100%: All references resolve → proceed
- 95-99%: Minor issues → auto-fix or regenerate
- <95%: Significant inconsistencies → flag for review

### Testability Scoring

**What**: Assess if acceptance criteria are concrete and measurable.

**Implementation**:
```typescript
interface TestabilitySignals {
  vagueCriteria: string[];      // "should work well" = vague
  measurableCriteria: string[]; // "return 200 status" = measurable
  quantifiedCriteria: string[]; // "response < 100ms" = quantified
}

const VAGUE_PATTERNS = [
  /should work/i,
  /must be good/i,
  /performs well/i,
  /handles errors/i  // vague unless quantified
];

const MEASURABLE_PATTERNS = [
  /return \d+/i,      // "return 200"
  /throw \w+Error/i,  // "throw ValidationError"
  /< \d+ms/i,         // "< 100ms"
  /\d+% coverage/i    // "80% coverage"
];

async function scoreTestability(spec: string): Promise<number> {
  const criteria = extractAcceptanceCriteria(spec);

  const vague = criteria.filter(c =>
    VAGUE_PATTERNS.some(pattern => pattern.test(c))
  );

  const measurable = criteria.filter(c =>
    MEASURABLE_PATTERNS.some(pattern => pattern.test(c))
  );

  return (measurable.length / criteria.length) * 100;
}
```

**Thresholds**:
- >80%: Most criteria measurable → proceed
- 50-80%: Some vagueness → request clarification
- <50%: Too vague → regenerate with examples

### Integration Coherence (Tier 4)

**What**: Using the Integration Registry, check if all imports have matching exports.

**Implementation**:
```typescript
async function scoreIntegrationCoherence(): Promise<number> {
  const db = await openDatabase('.spec2/integration-registry.db');

  // Unresolved imports (imports with no matching export)
  const unresolvedCount = await db.get(`
    SELECT COUNT(*) as count
    FROM imports i
    LEFT JOIN exports e ON i.name = e.name
    WHERE e.id IS NULL
  `);

  // Total imports
  const totalImports = await db.get(`
    SELECT COUNT(*) as count FROM imports
  `);

  const resolvedRatio = 1 - (unresolvedCount.count / totalImports.count);

  return resolvedRatio * 100;
}
```

**Thresholds**:
- 100%: All imports resolved → proceed
- 90-99%: Minor gaps → generate missing interfaces
- <90%: Major integration issues → review architecture

### Combined Spec Confidence

```typescript
interface SpecConfidence {
  completeness: number;  // 0-100
  consistency: number;   // 0-100
  testability: number;   // 0-100
  integration: number;   // 0-100 (Tier 4 only)
  overall: number;       // weighted average
}

function computeSpecConfidence(scores: {
  completeness: number,
  consistency: number,
  testability: number,
  integration?: number
}): SpecConfidence {
  const weights = {
    completeness: 0.25,
    consistency: 0.35,  // Most critical
    testability: 0.25,
    integration: 0.15   // Only for Tier 4
  };

  const overall =
    scores.completeness * weights.completeness +
    scores.consistency * weights.consistency +
    scores.testability * weights.testability +
    (scores.integration || 100) * weights.integration;

  return {
    ...scores,
    integration: scores.integration || 100,
    overall
  };
}
```

**Routing**:
- 90-100: Auto-proceed to next tier
- 70-89: Flag for quick human review (1-2 min)
- 50-69: Detailed human review required
- <50: Reject, regenerate with specific issues

---

## Layer 2: Artifact Verification

### Correspondence Density

**What**: Check if all properties are mapped to ≥3 validation layers.

**Implementation**:
```typescript
interface CorrespondenceMatrix {
  property: string;
  layers: string[];  // Which layers verify this property
}

async function scoreCorrespondenceDensity(
  component: string
): Promise<number> {
  const correspondence = await loadArtifact(
    component,
    'correspondence.json'
  );

  const propertiesWithEnoughLayers = correspondence.filter(
    prop => prop.layers.length >= 3
  );

  return (propertiesWithEnoughLayers.length / correspondence.length) * 100;
}
```

**Thresholds**:
- 100%: All properties ≥3 layers → proceed
- 80-99%: Some gaps → regenerate artifacts
- <80%: Insufficient coverage → review spec

### Completeness Coverage

**What**: % of acceptance criteria that have corresponding test artifacts.

**Implementation**:
```typescript
async function scoreCompletenessCoverage(
  component: string
): Promise<number> {
  const completeness = await loadArtifact(
    component,
    'completeness.json'
  );

  const coveredCriteria = completeness.acceptanceCriteria.filter(
    criterion => criterion.coveredBy.length > 0
  );

  return (coveredCriteria.length / completeness.acceptanceCriteria.length) * 100;
}
```

**Thresholds**:
- 100%: All criteria covered → proceed
- 90-99%: Minor gaps → add missing artifacts
- <90%: Significant gaps → regenerate

### Test Specificity

**What**: Are test requirements concrete (input → expected output) or vague?

**Implementation**:
```typescript
interface TestRequirement {
  description: string;
  hasInput: boolean;      // Specifies input data?
  hasExpectedOutput: boolean;  // Specifies expected result?
  hasErrorCases: boolean; // Specifies error scenarios?
}

async function scoreTestSpecificity(
  component: string
): Promise<number> {
  const testReqs = await loadArtifact(
    component,
    'test-requirements.md'
  );

  const parsed = parseTestRequirements(testReqs);

  const specific = parsed.filter(req =>
    req.hasInput && req.hasExpectedOutput && req.hasErrorCases
  );

  return (specific.length / parsed.length) * 100;
}
```

**Example**:
```markdown
<!-- VAGUE (scores 0/3) -->
- Test login functionality

<!-- SPECIFIC (scores 3/3) -->
- Test login with valid credentials:
  Input: {email: "test@example.com", password: "ValidPass123!"}
  Expected: {accessToken: JWT, refreshToken: JWT}
  Error cases:
    - Invalid email → ValidationError
    - Wrong password → AuthenticationError
    - Account locked → AccountLockedError
```

**Thresholds**:
- >80%: Most tests specific → proceed
- 50-80%: Some vagueness → add examples
- <50%: Too vague → regenerate with concrete examples

### Combined Artifact Confidence

```typescript
interface ArtifactConfidence {
  correspondenceDensity: number;
  completenessCoverage: number;
  testSpecificity: number;
  overall: number;
}

function computeArtifactConfidence(scores: {
  correspondenceDensity: number,
  completenessCoverage: number,
  testSpecificity: number
}): ArtifactConfidence {
  const overall = (
    scores.correspondenceDensity * 0.3 +
    scores.completenessCoverage * 0.4 +
    scores.testSpecificity * 0.3
  );

  return { ...scores, overall };
}
```

**Routing**:
- 90-100: Auto-proceed to code generation
- 70-89: Quick review
- 50-69: Detailed review
- <50: Regenerate artifacts

---

## Layer 3: Code Verification (The Big One)

### Anti-Hallucination Detection

**What**: Verify all referenced APIs, libraries, and functions actually exist.

**Research Foundation**:
- [AST-based validation achieves 100% precision](https://arxiv.org/abs/2601.19106)
- [20% of AI package recommendations don't exist](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5610993)

**Implementation**:

#### 3.1: Library Introspection

```typescript
async function buildKnowledgeBase(language: string): Promise<KnowledgeBase> {
  // Dynamically introspect available libraries
  const stdlib = await introspectStandardLibrary(language);
  const installed = await introspectInstalledPackages(language);

  return {
    stdlib,      // e.g., Python's 'os', 'sys', 'json'
    installed,   // e.g., from requirements.txt, package.json
    functions: [...stdlib.functions, ...installed.functions],
    types: [...stdlib.types, ...installed.types]
  };
}

// Python example
async function introspectPythonStdlib(): Promise<Library> {
  const result = await Bash.run(`
    python3 -c "
import sys
import pkgutil
import inspect

for module in pkgutil.iter_modules():
    try:
        mod = __import__(module.name)
        funcs = [name for name, obj in inspect.getmembers(mod) if inspect.isfunction(obj)]
        print(f'{module.name}: {funcs}')
    except: pass
"
  `);

  return parseIntrospectionOutput(result);
}
```

#### 3.2: AST-Based Validation

```typescript
async function detectHallucinations(
  code: string,
  language: string
): Promise<HallucinationReport> {
  const kb = await buildKnowledgeBase(language);

  // Parse code into AST
  const ast = parseAST(code, language);

  // Extract all imports
  const imports = extractImports(ast);  // e.g., "import pandas as pd"
  const invalidImports = imports.filter(
    imp => !kb.stdlib.includes(imp) && !kb.installed.includes(imp)
  );

  // Extract all function calls
  const calls = extractFunctionCalls(ast);  // e.g., "pd.read_csv()"
  const invalidCalls = calls.filter(
    call => !kb.functions.includes(call.name)
  );

  // Extract all type references
  const typeRefs = extractTypeReferences(ast);  // e.g., "DataFrame"
  const invalidTypes = typeRefs.filter(
    type => !kb.types.includes(type)
  );

  const totalRefs = imports.length + calls.length + typeRefs.length;
  const invalidRefs = invalidImports.length + invalidCalls.length + invalidTypes.length;

  return {
    invalidImports,
    invalidCalls,
    invalidTypes,
    hallucinationRate: (invalidRefs / totalRefs) * 100,
    canAutoCorrect: invalidRefs < 5  // Heuristic
  };
}
```

**Auto-Correction** (if hallucination rate < 10%):
```typescript
async function autoCorrectHallucinations(
  code: string,
  report: HallucinationReport,
  kb: KnowledgeBase
): Promise<string> {
  let corrected = code;

  // Fix invalid imports (suggest similar valid ones)
  for (const invalidImport of report.invalidImports) {
    const suggestion = findSimilar(invalidImport, kb.stdlib);
    if (suggestion.similarity > 0.8) {
      corrected = corrected.replace(invalidImport, suggestion.name);
    }
  }

  // Fix invalid function calls
  for (const invalidCall of report.invalidCalls) {
    const suggestion = findSimilar(invalidCall.name, kb.functions);
    if (suggestion.similarity > 0.8) {
      corrected = corrected.replace(invalidCall.name, suggestion.name);
    }
  }

  return corrected;
}
```

**Thresholds**:
- 0%: No hallucinations → proceed
- 1-10%: Minor hallucinations → auto-correct
- 11-30%: Moderate hallucinations → regenerate code
- >30%: Severe hallucinations → review spec (likely spec issue)

### Anti-Hollow Test Detection

**What**: Detect tests that look like tests but don't actually test anything.

**Research Foundation**:
- Coverage alone is insufficient (coverage paradox)
- [Mutation testing >80% is 2026 standard](https://oneuptime.com/blog/post/2026-01-24-mutation-testing/view)

**Implementation**:

#### 3.3: Assertion Density

```typescript
async function measureAssertionDensity(
  testFile: string,
  language: string
): Promise<number> {
  const ast = parseAST(testFile, language);

  // Extract test functions
  const testFunctions = extractTestFunctions(ast);  // e.g., test_*, it(), test()

  // Count assertions per test
  const assertionPatterns = {
    python: ['assert ', 'self.assert', 'pytest.raises'],
    typescript: ['expect(', 'assert(', 'toBe', 'toEqual'],
    go: ['if err != nil', 't.Error', 't.Fatal'],
  };

  const assertions = testFunctions.map(func => {
    const body = func.body.toString();
    const assertCount = assertionPatterns[language].reduce(
      (count, pattern) => count + (body.match(new RegExp(pattern, 'g'))?.length || 0),
      0
    );
    return assertCount;
  });

  const avgAssertions = assertions.reduce((a, b) => a + b, 0) / assertions.length;

  return avgAssertions;
}
```

**Thresholds**:
- ≥3 assertions/test: Good test quality
- 1-2 assertions/test: Weak tests, flag for review
- <1 assertion/test: Hollow tests, REJECT

#### 3.4: Mock Ratio

```typescript
async function measureMockRatio(
  testFile: string,
  language: string
): Promise<number> {
  const ast = parseAST(testFile, language);

  const mockPatterns = {
    python: ['Mock(', 'patch(', 'MagicMock'],
    typescript: ['jest.mock', 'sinon.stub', 'vi.mock'],
    go: ['gomock.', 'mockgen'],
  };

  const realCallPatterns = {
    // Actual function calls (not mocked)
    // This is language-specific and requires heuristics
  };

  const mockCount = countOccurrences(testFile, mockPatterns[language]);
  const realCallCount = countOccurrences(testFile, realCallPatterns[language]);

  const mockRatio = mockCount / (mockCount + realCallCount);

  return mockRatio * 100;
}
```

**Thresholds**:
- <30%: Good balance (mostly real, some mocks)
- 30-60%: Moderate mocking, acceptable
- 60-80%: Heavy mocking, flag for review
- >80%: Mock paradise, REJECT (tests prove nothing)

#### 3.5: Coverage Paradox Detection

```typescript
interface CoverageParadox {
  lineCoverage: number;      // e.g., 95%
  branchCoverage: number;    // e.g., 80%
  assertionDensity: number;  // e.g., 0.8 assertions/test
  isParadox: boolean;        // High coverage + low assertions = paradox
}

async function detectCoverageParadox(
  component: string,
  language: string
): Promise<CoverageParadox> {
  const coverage = await runCoverage(component, language);
  const density = await measureAssertionDensity(
    `${component}_test`,
    language
  );

  // Paradox: >80% coverage but <2 assertions/test
  const isParadox = coverage.line > 80 && density < 2;

  return {
    lineCoverage: coverage.line,
    branchCoverage: coverage.branch,
    assertionDensity: density,
    isParadox
  };
}
```

**If paradox detected**: REJECT, regenerate tests with concrete examples

#### 3.6: Mutation Testing

**Tools** (by language):
- **Python**: [mutmut](https://github.com/boxed/mutmut)
- **JavaScript/TypeScript**: [Stryker](https://stryker-mutator.io/)
- **.NET**: [Stryker.NET](https://stryker-mutator.io/docs/stryker-net/introduction/)
- **Java**: [PITest](https://pitest.org/)
- **Go**: [go-mutesting](https://github.com/zimmski/go-mutesting)

**Implementation**:
```typescript
async function runMutationTesting(
  component: string,
  language: string
): Promise<MutationScore> {
  const tool = {
    python: 'mutmut',
    typescript: 'stryker',
    javascript: 'stryker',
    csharp: 'stryker',
    java: 'pitest',
    go: 'go-mutesting'
  }[language];

  const result = await Bash.run(`
    cd ${component} && ${tool} run --config ${tool}.conf.json
  `);

  const score = parseMutationScore(result);

  return {
    killed: score.killed,      // Mutants detected by tests
    survived: score.survived,  // Mutants NOT detected
    timeout: score.timeout,    // Mutants that caused timeouts
    score: (score.killed / (score.killed + score.survived)) * 100
  };
}
```

**Thresholds** ([2026 standard](https://oneuptime.com/blog/post/2026-01-24-mutation-testing/view)):
- >80%: Excellent test quality → proceed
- 60-80%: Good, but room for improvement → flag for review
- 40-60%: Weak tests → regenerate with better test cases
- <40%: Inadequate tests → REJECT

**Note**: Mutation testing is expensive (10-60 min). Only run if:
1. Component is critical (high risk)
2. Other metrics flag concerns
3. User explicitly requests it

### Code Quality Metrics

**Tools**:
- [SonarQube Community Edition](https://www.sonarsource.com/products/sonarqube/) (deterministic, 21 languages)
- [Semgrep](https://semgrep.dev/) (rule-based security)
- Language-specific: ESLint, Ruff, golangci-lint, Clippy

**Implementation**:
```typescript
async function measureCodeQuality(
  component: string,
  language: string
): Promise<CodeQualityMetrics> {
  // Run static analysis
  const sonarResult = await Bash.run(`
    sonar-scanner \
      -Dsonar.projectKey=${component} \
      -Dsonar.sources=${component}/src \
      -Dsonar.tests=${component}/tests
  `);

  const metrics = parseSonarQube(sonarResult);

  return {
    cyclomaticComplexity: metrics.complexity,
    cognitiveComplexity: metrics.cognitiveComplexity,
    maintainabilityIndex: metrics.maintainability,
    technicalDebt: metrics.debt,
    codeSmells: metrics.codeSmells,
    vulnerabilities: metrics.vulnerabilities,
    securityHotspots: metrics.securityHotspots
  };
}
```

**Thresholds**:
- Cyclomatic complexity: <10 per function (good), 10-20 (review), >20 (refactor)
- Cognitive complexity: <15 per function (good), >15 (hard to understand)
- Maintainability index: >65 (A grade), 50-65 (B), <50 (C/D, needs work)
- Vulnerabilities: 0 (proceed), 1-2 (fix before proceeding), >2 (REJECT)

### Combined Code Confidence

```typescript
interface CodeConfidence {
  hallucinationRate: number;      // Lower is better (0-100)
  assertionDensity: number;       // Higher is better (avg per test)
  mockRatio: number;              // Lower is better (0-100)
  coverageParadox: boolean;       // False is better
  mutationScore: number;          // Higher is better (0-100)
  cyclomaticComplexity: number;   // Lower is better
  maintainabilityIndex: number;   // Higher is better (0-100)
  vulnerabilities: number;        // Lower is better
  overall: number;                // 0-100
}

function computeCodeConfidence(metrics: CodeConfidence): number {
  // Normalize all metrics to 0-100 scale (higher = better)
  const normalized = {
    noHallucination: 100 - metrics.hallucinationRate,
    goodAssertions: Math.min((metrics.assertionDensity / 3) * 100, 100),
    lowMocking: 100 - metrics.mockRatio,
    noParadox: metrics.coverageParadox ? 0 : 100,
    goodMutation: metrics.mutationScore,
    lowComplexity: Math.max(100 - metrics.cyclomaticComplexity, 0),
    maintainable: metrics.maintainabilityIndex,
    secure: metrics.vulnerabilities === 0 ? 100 : Math.max(100 - metrics.vulnerabilities * 20, 0)
  };

  // Weighted average (security and hallucination are most critical)
  const weights = {
    noHallucination: 0.20,   // CRITICAL
    goodAssertions: 0.10,
    lowMocking: 0.10,
    noParadox: 0.05,
    goodMutation: 0.15,
    lowComplexity: 0.10,
    maintainable: 0.10,
    secure: 0.20             // CRITICAL
  };

  const overall = Object.keys(normalized).reduce(
    (sum, key) => sum + normalized[key] * weights[key],
    0
  );

  return overall;
}
```

**Routing**:
- 90-100: High confidence → auto-approve
- 75-89: Good quality → quick review
- 60-74: Moderate concerns → detailed review
- <60: Low confidence → regenerate or escalate

---

## Confidence-Based Routing

### Routing Decision Tree

```typescript
interface RoutingDecision {
  action: 'auto-approve' | 'quick-review' | 'detailed-review' | 'regenerate' | 'escalate';
  reason: string;
  humanReviewRequired: boolean;
  estimatedReviewTime: number;  // minutes
}

function routeBasedOnConfidence(
  specConfidence: number,
  artifactConfidence: number,
  codeConfidence: number,
  component: string
): RoutingDecision {
  const overall = (specConfidence + artifactConfidence + codeConfidence) / 3;

  // Hard gates (any fail → reject)
  if (codeConfidence < 60) {
    return {
      action: 'regenerate',
      reason: 'Code confidence too low (hallucinations, hollow tests, or vulnerabilities)',
      humanReviewRequired: false,
      estimatedReviewTime: 0
    };
  }

  if (specConfidence < 50 || artifactConfidence < 50) {
    return {
      action: 'regenerate',
      reason: 'Spec or artifact quality insufficient',
      humanReviewRequired: false,
      estimatedReviewTime: 0
    };
  }

  // Confidence-based routing
  if (overall >= 90) {
    return {
      action: 'auto-approve',
      reason: 'All metrics excellent',
      humanReviewRequired: false,
      estimatedReviewTime: 0
    };
  }

  if (overall >= 75) {
    return {
      action: 'quick-review',
      reason: 'Good quality, minor review needed',
      humanReviewRequired: true,
      estimatedReviewTime: 2  // 2 min review
    };
  }

  if (overall >= 60) {
    return {
      action: 'detailed-review',
      reason: 'Moderate concerns require careful review',
      humanReviewRequired: true,
      estimatedReviewTime: 10  // 10 min review
    };
  }

  return {
    action: 'escalate',
    reason: 'Confidence too low across multiple dimensions',
    humanReviewRequired: true,
    estimatedReviewTime: 30  // 30 min deep review
  };
}
```

### Integration with Phase A Workflow

**Modified orchestrate.ts**:
```typescript
// PHASE 3: CODE GENERATION & VALIDATION
for (const [component, spec] of componentSpecs) {
  let codeConfidence = 0;
  let iteration = 1;

  while (codeConfidence < 75 && iteration <= 50) {
    // Generate code
    await generateCode(component, spec, artifacts, integrationSpec, language);

    // RUN VERIFICATION CHECKPOINTS
    const verificationReport = await runVerificationCheckpoints(
      component,
      language
    );

    codeConfidence = verificationReport.codeConfidence.overall;

    if (codeConfidence >= 90) {
      console.log(`✅ Component ${component} auto-approved (confidence: ${codeConfidence})`);
      break;
    }

    if (codeConfidence >= 75) {
      console.log(`⚠️ Component ${component} needs quick review (confidence: ${codeConfidence})`);
      const approved = await quickReview(component, verificationReport);
      if (approved) break;
    }

    if (codeConfidence >= 60) {
      console.log(`🔴 Component ${component} needs detailed review (confidence: ${codeConfidence})`);
      const approved = await detailedReview(component, verificationReport);
      if (approved) break;
    }

    // Confidence < 60 → regenerate with specific issues
    console.log(`🔁 Regenerating ${component} (iteration ${iteration}, confidence: ${codeConfidence})`);
    console.log(`Issues: ${verificationReport.issues.join(', ')}`);
    iteration++;
  }

  if (codeConfidence < 60) {
    throw new Error(`Component ${component} failed verification after ${iteration} iterations`);
  }
}
```

---

## Tool Integration

### Required Tools (by language)

#### Python
```bash
# Anti-hallucination
pip install ast-analyzer  # Custom or use ast module

# Test quality
pip install pytest pytest-cov mutmut

# Code quality
pip install ruff mypy radon
```

#### TypeScript/JavaScript
```bash
# Anti-hallucination
npm install -g @babel/parser  # AST parsing

# Test quality
npm install -g stryker stryker-cli jest

# Code quality
npm install -g eslint @typescript-eslint/parser
```

#### Go
```bash
# Anti-hallucination
go install golang.org/x/tools/cmd/gotype@latest

# Test quality
go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest

# Code quality
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### Universal Tools

```bash
# SonarQube (all languages)
docker run -d --name sonarqube -p 9000:9000 sonarqube:community

# Semgrep (security)
pip install semgrep

# Lizard (complexity, multi-language)
pip install lizard
```

---

## Implementation Roadmap

### Phase A: Core Checkpoints (12 hours)

**Step 3.7: Anti-Hallucination Detection (4 hours)**
- Library introspection utilities (Python, TS, Go)
- AST-based validation
- Auto-correction for minor hallucinations
- Integration into code gen loop

**Step 3.8: Anti-Hollow Test Detection (4 hours)**
- Assertion density measurement
- Mock ratio detection
- Coverage paradox detection
- Test quality scoring

**Step 3.9: Confidence Scoring & Routing (4 hours)**
- Combine all metrics into confidence score
- Routing decision logic
- Integration with orchestration workflow
- Reporting (show user WHY confidence is X)

### Phase B: Advanced Verification (8 hours)

**Step 3.10: Mutation Testing Integration (4 hours)**
- Tool wrappers (Stryker, mutmut, PITest)
- Selective execution (only for critical/flagged components)
- Score interpretation and thresholds

**Step 3.11: Code Quality Integration (4 hours)**
- SonarQube integration
- Semgrep security scanning
- Language-specific linters
- Aggregate quality metrics

### Total Verification System: 20 hours

---

## Expected Impact

### Defect Reduction
- **Hallucinations**: 96% reduction (based on [research](https://arxiv.org/html/2601.19106v1))
- **Hollow tests**: 90% reduction (assertion density + mutation testing)
- **Security vulnerabilities**: 80% reduction (SonarQube + Semgrep)
- **Overall defect rate**: 70-85% reduction

### Confidence in Auto-Approval
- Current: 0% (all code requires human review)
- After checkpoints: 40-60% auto-approved (confidence >90)
- Human review time reduced: 50-70% (only review flagged components)

### Build Quality
- Mutation scores: Target >80% (2026 standard)
- Code maintainability: Target A/B grade
- Zero hallucinated APIs in production
- Zero hollow tests in codebase

---

## Cost-Benefit Analysis

### Development Cost
- Anti-hallucination: 4 hours
- Anti-hollow: 4 hours
- Confidence scoring: 4 hours
- Mutation testing: 4 hours
- Code quality: 4 hours
- **Total: 20 hours**

### Runtime Cost (per build)
- Anti-hallucination: ~30s (AST parsing + introspection)
- Anti-hollow: ~1 min (assertion counting, coverage)
- Confidence scoring: ~5s (computation)
- Mutation testing: ~15-30 min (EXPENSIVE, selective only)
- Code quality: ~2-5 min (SonarQube scan)
- **Total: 5-40 min** (depends on mutation testing usage)

### Savings
- Defects caught before production: 70-85% reduction
- Human review time: 50-70% reduction (only flagged components)
- Debug time saved: 3-10 hours per build (fewer production bugs)

**ROI**: Positive after 2-3 builds

---

## Recommendation

**✅ Implement full verification checkpoint system (20 hours)**

**Critical layers** (must-have):
1. Anti-hallucination detection (prevents phantom API calls)
2. Anti-hollow test detection (ensures tests actually test)
3. Confidence scoring (smart routing)

**Nice-to-have layers** (can defer):
4. Mutation testing (expensive, use selectively)
5. SonarQube integration (good but not blocking)

**Revised Phase A Total**: 36h (original) + 20h (verification) = **56 hours**

OR

**Phased approach**:
- **Phase A**: 36h (automation + visual review + registry)
- **Phase A.5**: 12h (anti-hallucination + anti-hollow + confidence) ← CRITICAL
- **Phase B**: 8h (mutation testing + code quality) ← OPTIONAL

**User's intuition is correct**: This is the missing defensive layer that makes spec2 actually trustworthy.

---

## Sources

- [LLM Hallucinations in AI Code Review](https://diffray.ai/blog/llm-hallucinations-code-review/)
- [Detecting and Correcting Hallucinations via AST Analysis](https://arxiv.org/abs/2601.19106)
- [Auto-Generated AI Code Hallucinations Research](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5610993)
- [Mutation Testing Standards 2026](https://oneuptime.com/blog/post/2026-01-24-mutation-testing/view)
- [SonarQube](https://www.sonarsource.com/products/sonarqube/)
- [Test Quality Metrics Guide](https://www.qodo.ai/blog/software-testing-metrics/)
