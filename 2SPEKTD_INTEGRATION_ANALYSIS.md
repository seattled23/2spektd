# 2spektd Integration Analysis & Extension Design

**Date**: April 11, 2026
**Purpose**: Analyze current 2spektd capabilities and design extensions for sub-agent integration

---

## I. CURRENT STATE

### What Exists ✅

**Location**: `/home/swarm/2spektd/validation/`

**Implementation Status** (from IMPLEMENTATION-STATUS.md):
- ✅ **All 4 language modules complete**: Go (12 layers), TypeScript (12 layers), Python (12 layers), Shell (8 layers)
- ✅ **8 agent workflows defined**: Tier 1-3 spec agents, integration spec, artifact gen/audit, code gen/fix
- ✅ **Master orchestrator**: `orchestrate-build.sh` (full workflow automation)
- ✅ **12-layer validation stack**: L-1 (build/test) through L10 (determinism)
- ✅ **Anti-reward-hacking features**: Context isolation, immutable artifacts, one-shot code gen

**Skill Definition**: `~/.claude/skills/2spektd-new/SKILL.md`
- Currently **documentation only** - no executable implementation
- Describes the workflow but doesn't launch it

### How It Works Now ⚠️

**Manual Orchestration Model**:
```bash
# User runs:
./orchestrate-build.sh "Build analytics dashboard"

# Script prompts:
"📝 Action required (NEW session):
 Invoke: 'Generate Tier 1 spec from requirements'
 Save to: .outline/specs/system-spec.md"

# User manually:
1. Opens new Claude Code session
2. Copies the prompt
3. Runs the agent
4. Saves output
5. Returns to orchestrator
6. Presses Enter to continue
```

**Problem**: Requires manual context-switching between orchestrator shell and Claude Code sessions.

---

## II. GAPS & LIMITATIONS

### Gap 1: No Automated Agent Launching ❌

**What's Missing**:
- Orchestrator can't programmatically launch Claude Code agents
- Relies on user manually invoking agents in new sessions
- No way to pass context/specs directly to agents

**Impact**:
- 2-5 hour workflow requires ~20 manual context switches
- Error-prone (user might forget to save output, use wrong session)
- Not suitable for CI/CD or unattended operation

### Gap 2: Skill Doesn't Execute ❌

**What's Missing**:
- `/2spektd:new "<requirements>"` currently does nothing
- Skill file is documentation, not implementation
- No connection between skill invocation and orchestrator

**Impact**:
- User expectation: `/2spektd:new` should launch the workflow
- Reality: User must manually run `orchestrate-build.sh`
- Inconsistent with other Claude Code skills

### Gap 3: Sub-Agents Can't Access 2spektd ❌

**What's Missing**:
- Task agents (launched via Task tool) can't invoke `/2spektd:new`
- No API/function interface for sub-agents to trigger 2spektd
- Skill invocations are not available in Task agent tool sets

**Impact**:
- Can't delegate "build feature X with 2spektd validation" to a sub-agent
- Forces main agent to orchestrate, bloating context window
- Prevents parallel 2spektd builds (can't launch 3 components simultaneously)

### Gap 4: No Gemini CLI Integration ❌

**What's Missing**:
- Gemini CLI has no awareness of 2spektd
- No routing mechanism to hand off complex tasks to Claude Code
- No shared state/artifact passing between Gemini and Claude

**Impact**:
- User must manually decide: "This task needs 2spektd, switch to Claude Code"
- Can't leverage Gemini's strengths (research, analysis) + Claude's automation
- No hybrid workflows

---

## III. EXTENSION DESIGN

### Extension 1: Automated Orchestration Agent

**Goal**: Replace manual "invoke in new session" with Task tool calls

**Implementation**:
```typescript
// New file: ~/.claude/skills/2spektd-new/orchestrate.ts

import { Task } from '@claude/sdk';

export async function orchestrate2spektd(requirements: string) {
  // Phase 1: Tier 1 Spec
  const tier1Agent = await Task.launch({
    subagent_type: 'odin:architect',
    prompt: `Generate Tier 1 system spec from: ${requirements}

    Output format:
    ## System Overview
    ## Subsystems
    - Subsystem A: <description>
    - Subsystem B: <description>
    ## Integration Points
    ## Non-Functional Requirements`,
    description: 'Generate system specification'
  });

  const systemSpec = await tier1Agent.result();
  await fs.writeFile('.outline/specs/system-spec.md', systemSpec);
  await lockSpec('system-spec.md');

  // Phase 2: Tier 2 Specs (parallel)
  const subsystems = extractSubsystems(systemSpec);
  const tier2Agents = subsystems.map(subsystem =>
    Task.launch({
      subagent_type: 'odin:architect',
      prompt: `Generate Tier 2 spec for subsystem: ${subsystem}

      From system spec: ${systemSpec}

      Output format:
      ## Subsystem: ${subsystem}
      ## Components
      - Component A: <purpose>
      ## Dependencies
      ## Test Strategy`,
      description: `Generate ${subsystem} spec`
    })
  );

  const subsystemSpecs = await Promise.all(tier2Agents.map(a => a.result()));
  // ... continue for Tier 3, artifacts, code gen
}
```

**Benefits**:
- Fully automated - no manual session switching
- Parallelizes where possible (Tier 2 specs, artifact gen, component builds)
- Verifiable - captures all agent outputs
- Resumable - checkpoints at each phase

**Effort**: 8 hours (TypeScript implementation + testing)

---

### Extension 2: Executable Skill Implementation

**Goal**: Make `/2spektd:new "<requirements>"` actually launch the orchestrator

**Implementation**:
```typescript
// ~/.claude/skills/2spektd-new/skill.ts

export async function execute(requirements: string) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     2spektd: Building with Outline-Strong Validation          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Requirements: ${requirements}`);
  console.log('');

  // Launch orchestration
  const result = await orchestrate2spektd(requirements);

  // Report final status
  console.log('');
  console.log('✅ Build complete!');
  console.log(`   Components: ${result.components.length}`);
  console.log(`   Validation: ${result.validationStatus}`);
  console.log(`   Location: ${result.outputPath}`);

  return result;
}
```

**Configuration** (update to SKILL.md):
```yaml
# SKILL.md header
---
executable: true
entry_point: skill.ts
export: execute
arguments:
  - name: requirements
    type: string
    description: "Requirements description or path to requirements.md"
---
```

**Benefits**:
- User expectation met: `/2spektd:new` works
- Consistent with Claude Code skill model
- Clear success/failure reporting
- Artifact paths returned for downstream use

**Effort**: 4 hours (skill wrapper + entry point)

---

### Extension 3: Sub-Agent API

**Goal**: Allow Task agents to trigger 2spektd builds

**Design Option A: Tool-Based**

Create a new MCP tool `build_with_2spektd`:
```typescript
// Add to CompanyOS MCP server or create dedicated 2spektd MCP server

{
  "name": "build_with_2spektd",
  "description": "Build a component using 2spektd Outline-Strong validation",
  "inputSchema": {
    "type": "object",
    "properties": {
      "requirements": {
        "type": "string",
        "description": "Component requirements description"
      },
      "language": {
        "type": "string",
        "enum": ["go", "typescript", "python", "shell"]
      },
      "output_path": {
        "type": "string",
        "description": "Where to save generated code"
      }
    },
    "required": ["requirements", "language", "output_path"]
  }
}
```

**Usage in sub-agent**:
```typescript
// In Task agent prompt:
"When you need to build a validated component, use the build_with_2spektd tool:

Example:
<invoke name="build_with_2spektd">
  <param name="requirements">User authentication service with JWT</param>
  <param name="language">typescript</param>
  <param name="output_path">src/services/auth</param>
</invoke>

The tool will return validation results and file paths."
```

**Benefits**:
- Sub-agents get direct access
- MCP tools are available to all Task agents
- Consistent with existing tool usage patterns
- No special skill invocation needed

**Design Option B: Skill Proxying**

Allow Task agents to invoke skills via a meta-tool:
```typescript
{
  "name": "invoke_skill",
  "description": "Invoke a Claude Code skill from within a sub-agent",
  "inputSchema": {
    "type": "object",
    "properties": {
      "skill": {
        "type": "string",
        "description": "Skill name (e.g., '2spektd:new')"
      },
      "args": {
        "type": "string",
        "description": "Skill arguments"
      }
    }
  }
}
```

**Usage**:
```typescript
<invoke name="invoke_skill">
  <param name="skill">2spektd:new</param>
  <param name="args">Build analytics dashboard</param>
</invoke>
```

**Trade-offs**:
| Approach | Pros | Cons |
|----------|------|------|
| **Tool-Based (Option A)** | Direct access, typed params, better error handling | Requires MCP server implementation |
| **Skill Proxying (Option B)** | Works with any skill, flexible | Generic interface, harder to type-check |

**Recommendation**: **Option A** (tool-based) for production, Option B for rapid prototyping

**Effort**:
- Option A: 12 hours (MCP tool + integration)
- Option B: 6 hours (proxy tool + skill invoker)

---

### Extension 4: Gemini CLI Integration

**Goal**: Route complex tasks from Gemini CLI to Claude Code's 2spektd

**Architecture**:
```
┌─────────────────┐
│   Gemini CLI    │
│                 │
│  /build X       │──┐
└─────────────────┘  │
                     │
                     │ Complexity > threshold?
                     │ Language = go/ts/py?
                     │ Validation required?
                     │
                     ▼
              ┌─────────────┐      ┌──────────────────┐
              │   Router    │─────▶│  Claude Code     │
              │             │      │                  │
              │ - Analyze   │      │  /2spektd:new    │
              │ - Decide    │      │                  │
              │ - Route     │      │  (orchestrate)   │
              │ - Bridge    │      │                  │
              └─────────────┘      └──────────────────┘
                     │
                     │ Result
                     ▼
              ┌─────────────┐
              │   Gemini    │
              │  continues  │
              └─────────────┘
```

**Implementation**:

**Step 1: Gemini CLI Plugin** (`~/.gemini/plugins/2spektd-bridge.sh`):
```bash
#!/bin/bash
# Gemini CLI plugin to route tasks to Claude Code 2spektd

function gemini_build() {
  local requirements="$1"
  local language="$2"

  # Analyze complexity
  local complexity=$(analyze_complexity "$requirements")

  if [[ $complexity -gt 7 ]]; then
    echo "🔀 Routing to Claude Code (complexity: $complexity/10)"
    echo ""

    # Invoke Claude Code via API or CLI
    claude-code skill /2spektd:new "$requirements" \
      --language="$language" \
      --return-json > /tmp/2spektd-result.json

    # Parse result and continue in Gemini
    local output_path=$(jq -r '.outputPath' /tmp/2spektd-result.json)

    echo "✅ Component built at: $output_path"
    echo ""
    echo "Continuing in Gemini for integration..."

    # Gemini resumes with the validated component
    gemini integrate "$output_path"
  else
    echo "Building directly in Gemini..."
    # Standard Gemini build workflow
  fi
}
```

**Step 2: Complexity Analyzer**:
```typescript
// Heuristic scoring (0-10)
function analyzeComplexity(requirements: string): number {
  let score = 0;

  // Language indicators
  if (/(go|golang|concurrent|goroutine)/i.test(requirements)) score += 2;
  if (/(typescript|react|frontend)/i.test(requirements)) score += 1;

  // Architecture indicators
  if (/(microservice|distributed|scalable)/i.test(requirements)) score += 3;
  if (/(api|rest|graphql|grpc)/i.test(requirements)) score += 2;

  // Quality indicators
  if (/(production|enterprise|mission.critical)/i.test(requirements)) score += 3;
  if (/(validate|verify|test|qa)/i.test(requirements)) score += 2;

  // Scope indicators
  const sentenceCount = requirements.split(/[.!?]/).length;
  score += Math.min(sentenceCount / 5, 3);

  return Math.min(score, 10);
}
```

**Step 3: Claude Code API Endpoint**:
```typescript
// Add to Claude Code server
app.post('/api/skills/invoke', async (req, res) => {
  const { skill, args } = req.body;

  // Validate skill exists
  if (!skills.has(skill)) {
    return res.status(404).json({ error: 'Skill not found' });
  }

  // Execute skill
  const result = await skills.execute(skill, args);

  res.json(result);
});
```

**Benefits**:
- Seamless handoff between tools
- User doesn't need to manually switch
- Leverages strengths of each tool:
  - Gemini: Research, exploration, iteration
  - Claude Code: Automation, validation, rigor
- Shared artifact passing

**Effort**: 20 hours (plugin + router + API + testing)

---

## IV. IMPLEMENTATION ROADMAP

### Phase A: Core Automation (20 hours)

**Week 1** (12 hours):
1. ✅ Automated orchestration agent (8 hours)
   - Replace manual session launching with Task calls
   - Implement checkpoint/resume logic
   - Add parallel execution for independent phases

2. ✅ Executable skill implementation (4 hours)
   - Make `/2spektd:new` launch orchestrator
   - Add argument parsing and validation
   - Return structured results

**Deliverable**: `/2spektd:new "<requirements>"` works end-to-end

### Phase B: Sub-Agent Integration (12 hours)

**Week 2** (12 hours):
1. ✅ MCP tool implementation (8 hours)
   - Create `build_with_2spektd` tool
   - Add to CompanyOS MCP server
   - Document sub-agent usage

2. ✅ Testing (4 hours)
   - Test Task agent invoking 2spektd
   - Verify parallel builds (3 components simultaneously)
   - Validate artifact passing

**Deliverable**: Task agents can build validated components

### Phase C: Gemini CLI Bridge (20 hours)

**Week 3** (20 hours):
1. ✅ Complexity analyzer (4 hours)
   - Heuristic scoring algorithm
   - Threshold calibration

2. ✅ Gemini plugin (6 hours)
   - `/build` command routing logic
   - Claude Code API client

3. ✅ Claude Code API (6 hours)
   - Skill invocation endpoint
   - Result formatting

4. ✅ Integration testing (4 hours)
   - End-to-end Gemini → Claude workflow
   - Error handling
   - Artifact handoff

**Deliverable**: Gemini CLI automatically routes complex builds to Claude Code

---

## V. TESTING PLAN

### Test Case 1: Direct Invocation
```bash
# User runs:
/2spektd:new "Build user authentication service with JWT tokens"

# Expected:
✅ Tier 1 spec generated
✅ Tier 2 specs generated (auth, token management)
✅ Tier 3 specs generated (login, logout, refresh, validate)
✅ Integration spec generated
✅ Artifacts locked
✅ Code generated (TypeScript)
✅ All 12 layers pass
✅ Integration tests pass

# Time: < 3 hours (fully automated)
```

### Test Case 2: Sub-Agent Delegation
```typescript
// Main agent task:
const result = await Task.launch({
  subagent_type: 'odin:backend-architect',
  prompt: `Build a REST API for user management using 2spektd validation.

  Requirements:
  - CRUD operations (Create, Read, Update, Delete users)
  - JWT authentication
  - Role-based access control
  - PostgreSQL persistence

  Use the build_with_2spektd tool to generate validated code.`,
  description: 'Build user management API'
});

// Expected:
✅ Sub-agent invokes build_with_2spektd tool
✅ 2spektd workflow executes in background
✅ Sub-agent receives validated code path
✅ Sub-agent continues with integration work
✅ Main context window unaffected
```

### Test Case 3: Gemini CLI Routing
```bash
# User in Gemini CLI:
$ gemini build "Create a distributed task queue with at-least-once delivery guarantees"

# Expected output:
🔀 Routing to Claude Code (complexity: 9/10)

Launching 2spektd build...
✅ Component built at: pkg/taskqueue
   - 4 subsystems validated
   - 12 components passing all layers
   - Integration tests: 24/24 passing

Continuing in Gemini for deployment planning...

# Gemini resumes:
Based on the validated implementation, recommended deployment:
- Use Redis for message broker
- Deploy 3 workers for redundancy
- Set up monitoring with Prometheus
```

---

## VI. SUCCESS CRITERIA

### Functional
- [ ] `/2spektd:new` launches and completes build without manual intervention
- [ ] Task agents can invoke 2spektd via tool
- [ ] Gemini CLI routes complex tasks to Claude Code
- [ ] All 3 integration methods produce valid, tested code

### Performance
- [ ] Full build (spec → validated code): < 3 hours
- [ ] Parallel component builds: 3× faster than sequential
- [ ] Context window usage: <20% for orchestrator (rest in sub-agents)

### Quality
- [ ] Zero false positives in hollow pattern detection
- [ ] All 12 validation layers pass
- [ ] Generated code passes production deployment checklist
- [ ] Artifacts properly locked and versioned

### Usability
- [ ] Documentation: Quick-start for all 3 usage methods
- [ ] Error messages: Clear, actionable
- [ ] Resume capability: Can continue after interruption
- [ ] Logging: Full audit trail of agent decisions

---

## VII. RISKS & MITIGATIONS

### Risk 1: Agent Context Exhaustion
**Problem**: Long builds might exceed sub-agent token limits
**Mitigation**:
- Checkpoint every 10K tokens
- Switch to fresh agent context
- Resume from checkpoint with compressed history

### Risk 2: Validation Layer Incompatibilities
**Problem**: Some validation tools might not work in WSL2/macOS
**Mitigation**:
- Fallback mechanisms per layer
- Skip gracefully with warnings
- Document platform limitations

### Risk 3: Gemini ↔ Claude API Reliability
**Problem**: Network/API failures during handoff
**Mitigation**:
- Retry with exponential backoff
- Save state before handoff
- Timeout after 5 minutes, alert user

---

## VIII. ALTERNATIVES CONSIDERED

### Alternative 1: Embed 2spektd in Claude Code Core
**Pros**: First-class integration, no skills needed
**Cons**: Bloats Claude Code, tight coupling, harder to update
**Decision**: Rejected - keep as modular skill

### Alternative 2: Pure Shell Scripts (No TypeScript)
**Pros**: Simple, no build step
**Cons**: No type safety, harder to test, limited API integration
**Decision**: Hybrid - Shell for validation, TypeScript for orchestration

### Alternative 3: Gemini Native Implementation
**Pros**: No Claude Code dependency
**Cons**: Duplicates work, Gemini lacks Task orchestration
**Decision**: Bridge model better leverages both tools

---

## IX. CONCLUSION

### Current State
✅ 2spektd **fully functional** for manual orchestration
✅ All language modules complete
✅ 12-layer validation working
❌ No automated orchestration
❌ No sub-agent access
❌ No Gemini CLI integration

### After Extensions
✅ `/2spektd:new` works automatically
✅ Task agents can build validated components
✅ Gemini CLI routes complex builds to Claude Code
✅ Production-ready for team use

### Effort Summary
- **Phase A** (Core automation): 20 hours
- **Phase B** (Sub-agent integration): 12 hours
- **Phase C** (Gemini bridge): 20 hours
- **Total**: 52 hours (~1.5 weeks for 1 developer)

### Recommendation
**Build Phase A immediately** - automates the most painful manual work
**Build Phase B next** - unlocks parallel workflows
**Defer Phase C** - nice-to-have, evaluate after A+B

---

**Author**: ODIN (Claude Code)
**Date**: April 11, 2026
**Status**: Design Complete, Ready for Implementation
