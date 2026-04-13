# spec2 Workflow Visual Guide

**Date**: April 11, 2026
**Purpose**: Visual representation of spec2's 4-tier progressive narrowing workflow

---

## I. COMPLETE WORKFLOW OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER REQUIREMENTS                                 │
│  "Build analytics dashboard with real-time WebSocket updates"           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   PHASE 1: SPECS       │
                    │   (4-Tier Narrowing)   │
                    └────────────┬────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
  ┌─────▼─────┐          ┌──────▼──────┐         ┌──────▼──────┐
  │  TIER 1   │          │   TIER 2    │         │   TIER 3    │
  │  System   │─────────▶│ Subsystems  │────────▶│ Components  │
  │           │          │             │         │             │
  │ 1 agent   │          │ N agents    │         │ M agents    │
  │ sequential│          │ PARALLEL    │         │ SEQUENTIAL  │
  └───────────┘          └─────────────┘         └──────┬──────┘
                                                         │
                                                  ┌──────▼──────┐
                                                  │   TIER 4    │
                                                  │ Integration │
                                                  │             │
                                                  │ 1 agent     │
                                                  │ sequential  │
                                                  └──────┬──────┘
                                                         │
                    ┌────────────────────────────────────┘
                    │
        ┌───────────▼───────────┐
        │   PHASE 2: ARTIFACTS  │
        │   (Per Component)     │
        └───────────┬───────────┘
                    │
            ┌───────┴────────┐
            │                │
     ┌──────▼──────┐  ┌──────▼──────┐
     │  Artifact   │  │  Artifact   │
     │  Generator  │  │   Auditor   │
     │             │  │             │
     │ Fresh agent │  │ Fresh agent │
     │  per comp   │  │  (isolated) │
     └──────┬──────┘  └──────┬──────┘
            │                │
            └───────┬────────┘
                    │ Loop until audit passes
                    │
        ┌───────────▼───────────┐
        │   PHASE 3: CODE GEN   │
        │   (Per Component)     │
        └───────────┬───────────┘
                    │
            ┌───────┴────────┐
            │                │
     ┌──────▼──────┐  ┌──────▼──────┐
     │    Code     │  │    Code     │
     │  Generator  │  │    Fixer    │
     │  (one-shot) │  │  (iterative)│
     │             │  │             │
     │ Fresh agent │  │ Fresh agent │
     │  per comp   │  │  each iter  │
     └──────┬──────┘  └──────┬──────┘
            │                │
            └───────┬────────┘
                    │ Loop until 12 layers pass
                    │
        ┌───────────▼───────────┐
        │ PHASE 4: INTEGRATION  │
        │      TEST             │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    ✅ VALIDATED       │
        │    PRODUCTION CODE    │
        └───────────────────────┘
```

---

## II. TIER 1-4 PROGRESSIVE NARROWING

```
┌────────────────────────────────────────────────────────────────────────┐
│                         TIER 1: SYSTEM SPEC                            │
│  Scope: 30,000 ft view - WHAT subsystems exist                        │
│  Output: ~5 pages                                                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Input: "Build analytics dashboard with real-time updates"            │
│         ↓                                                              │
│  ┌──────────────────────────────────────────────────────────┐         │
│  │  Agent analyzes and identifies subsystems:               │         │
│  │                                                           │         │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │         │
│  │  │     Auth     │  │  Dashboard   │  │  Metrics     │   │         │
│  │  │  Subsystem   │  │  UI System   │  │  API System  │   │         │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │         │
│  │                                                           │         │
│  │  ┌──────────────┐                                        │         │
│  │  │  Data Store  │                                        │         │
│  │  │  Subsystem   │                                        │         │
│  │  └──────────────┘                                        │         │
│  └──────────────────────────────────────────────────────────┘         │
│         ↓                                                              │
│  User reviews → Approves → 🔒 LOCKED                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ Passes to Tier 2
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        TIER 2: SUBSYSTEM SPECS                         │
│  Scope: 10,000 ft view - WHAT components per subsystem                │
│  Output: ~8 pages per subsystem                                       │
│  Isolation: Each agent sees ONLY ONE subsystem                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  For EACH subsystem (PARALLEL agents, isolated contexts):             │
│                                                                        │
│  ┌────────────────────────────────────────────────────────┐           │
│  │  AGENT 1 (Auth Subsystem)                              │           │
│  │  Input: System spec + "Auth Subsystem"                 │           │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │           │
│  │  │  Login   │  │  Logout  │  │   JWT    │             │           │
│  │  │Component │  │Component │  │ Manager  │             │           │
│  │  └──────────┘  └──────────┘  └──────────┘             │           │
│  │  ┌──────────┐                                          │           │
│  │  │ Session  │                                          │           │
│  │  │  Store   │                                          │           │
│  │  └──────────┘                                          │           │
│  │  User reviews → Approves → 🔒 LOCKED                   │           │
│  └────────────────────────────────────────────────────────┘           │
│                                                                        │
│  ┌────────────────────────────────────────────────────────┐           │
│  │  AGENT 2 (Dashboard UI)                                │           │
│  │  Input: System spec + "Dashboard UI System"            │           │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │           │
│  │  │  Chart   │  │  Table   │  │WebSocket │             │           │
│  │  │Component │  │Component │  │  Client  │             │           │
│  │  └──────────┘  └──────────┘  └──────────┘             │           │
│  │  User reviews → Approves → 🔒 LOCKED                   │           │
│  └────────────────────────────────────────────────────────┘           │
│                                                                        │
│  ... (AGENT 3 for Metrics API, AGENT 4 for Data Store)                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ Passes to Tier 3
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       TIER 3: COMPONENT SPECS                          │
│  Scope: Ground level - FUNCTION SIGNATURES + acceptance criteria      │
│  Output: ~12 pages per component                                      │
│  Isolation: Each agent sees ONLY ONE component                        │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  For EACH component (SEQUENTIAL - user reviews each):                 │
│                                                                        │
│  ┌────────────────────────────────────────────────────────┐           │
│  │  AGENT 1 (Login Component)                             │           │
│  │  Input: Auth subsystem spec + "Login Component"        │           │
│  │                                                         │           │
│  │  Function Signatures:                                  │           │
│  │  ┌────────────────────────────────────────────┐        │           │
│  │  │ login(email, password) → (token, error)    │        │           │
│  │  │   @pre: email matches RFC 5322 format      │        │           │
│  │  │   @post: returns JWT or error              │        │           │
│  │  │   @error: InvalidEmail, WrongPassword      │        │           │
│  │  │   Tests: 8 cases defined                   │        │           │
│  │  └────────────────────────────────────────────┘        │           │
│  │                                                         │           │
│  │  ┌────────────────────────────────────────────┐        │           │
│  │  │ validateEmail(email) → bool                │        │           │
│  │  │   @pre: non-empty string                   │        │           │
│  │  │   @post: true if RFC 5322 compliant        │        │           │
│  │  │   Tests: 6 cases defined                   │        │           │
│  │  └────────────────────────────────────────────┘        │           │
│  │                                                         │           │
│  │  User reviews → Approves → 🔒 LOCKED                   │           │
│  └────────────────────────────────────────────────────────┘           │
│                                                                        │
│  ┌────────────────────────────────────────────────────────┐           │
│  │  AGENT 2 (Logout Component)                            │           │
│  │  Input: Auth subsystem spec + "Logout Component"       │           │
│  │  ... (similar detail level)                            │           │
│  │  User reviews → Approves → 🔒 LOCKED                   │           │
│  └────────────────────────────────────────────────────────┘           │
│                                                                        │
│  ... (AGENT 3-N for all other components)                             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ Passes to Tier 4
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      TIER 4: INTEGRATION SPEC                          │
│  Scope: Horizontal - shared types, contracts, data flow               │
│  Output: ~10 pages                                                     │
│  Isolation: Agent sees ALL component specs (only time this happens)   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Input: ALL tier 3 component specs                                    │
│         ↓                                                              │
│  ┌──────────────────────────────────────────────────────┐             │
│  │  Agent identifies cross-component concerns:          │             │
│  │                                                       │             │
│  │  Shared Types:                                       │             │
│  │  ┌─────────────────────────────────────────┐         │             │
│  │  │ UserID: UUID v4 string format           │         │             │
│  │  │ Token:  JWT with 24h expiry             │         │             │
│  │  │ Timestamp: ISO 8601 format              │         │             │
│  │  └─────────────────────────────────────────┘         │             │
│  │                                                       │             │
│  │  Cross-Component Contracts:                          │             │
│  │  ┌─────────────────────────────────────────┐         │             │
│  │  │ Auth → Dashboard: Token in header        │         │             │
│  │  │ Dashboard → Metrics: WebSocket protocol  │         │             │
│  │  │ Metrics → Data Store: SQL queries        │         │             │
│  │  └─────────────────────────────────────────┘         │             │
│  │                                                       │             │
│  │  Data Flow:                                          │             │
│  │  ┌─────────────────────────────────────────┐         │             │
│  │  │ User → Login → JWT → Dashboard          │         │             │
│  │  │ Dashboard → WebSocket → Metrics API     │         │             │
│  │  │ Metrics API → Query → Data Store        │         │             │
│  │  │ Data Store → Response → Metrics API     │         │             │
│  │  │ Metrics API → Push → Dashboard          │         │             │
│  │  └─────────────────────────────────────────┘         │             │
│  │                                                       │             │
│  │  User reviews → Approves → 🔒 LOCKED                 │             │
│  └──────────────────────────────────────────────────────┘             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## III. AGENT ISOLATION MODEL

```
┌───────────────────────────────────────────────────────────────────────┐
│                      WHY ISOLATION MATTERS                            │
│  Each agent gets a FRESH context window = no memory of other agents  │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  WITHOUT ISOLATION (Bad - Reward Hacking Possible)                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────┐                          │
│  │         SINGLE AGENT                     │                          │
│  │  (sees everything in one context)        │                          │
│  │                                           │                          │
│  │  Memory contains:                         │                          │
│  │  • System spec                            │                          │
│  │  • All subsystem specs                    │                          │
│  │  • All component specs                    │                          │
│  │  • Artifact generation process            │                          │
│  │  • Validation criteria                    │                          │
│  │  • Code it generated                      │                          │
│  │  • Test results                           │                          │
│  │                                           │                          │
│  │  Agent CAN:                               │                          │
│  │  ❌ Adjust spec to match bad code        │                          │
│  │  ❌ Write tests that pass for wrong code │                          │
│  │  ❌ Game validation by learning patterns │                          │
│  │  ❌ See full system to optimize locally  │                          │
│  └──────────────────────────────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  WITH ISOLATION (Good - Reward Hacking Prevented)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Tier 1 Agent (System Spec)                                            │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • User requirements      │ → Output: system-spec.md                 │
│  │                          │ → 🔒 LOCKED                              │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Tier 2 Agent #1 (Auth Subsystem)                                      │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • system-spec.md 🔒      │ → Output: subsystem-auth.md              │
│  │ • "Auth Subsystem" only  │ → 🔒 LOCKED                              │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ Other subsystems      │                                          │
│  │ ❌ Component details     │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Tier 2 Agent #2 (Dashboard Subsystem) - PARALLEL                      │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • system-spec.md 🔒      │ → Output: subsystem-dashboard.md         │
│  │ • "Dashboard" only       │ → 🔒 LOCKED                              │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ Auth subsystem spec   │                                          │
│  │ ❌ Component details     │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Tier 3 Agent #1 (Login Component)                                     │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • subsystem-auth.md 🔒   │ → Output: comp-login.md                  │
│  │ • "Login Component" only │ → 🔒 LOCKED                              │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ System spec           │                                          │
│  │ ❌ Other subsystems      │                                          │
│  │ ❌ Other components      │                                          │
│  │ ❌ Validation layers     │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Artifact Generator (Login artifacts)                                  │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • comp-login.md 🔒       │ → Output: correspondence.json            │
│  │ • integration.md 🔒      │           completeness.json              │
│  │                          │           test-requirements.md           │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ How to code this      │                                          │
│  │ ❌ Validation layers     │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Artifact Auditor (INDEPENDENT)                                        │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • comp-login.md 🔒       │ → Output: PASS or FAIL                   │
│  │ • artifacts/ (above)     │                                          │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ Generator's reasoning │                                          │
│  │ ❌ How code will look    │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  Code Generator (ONE-SHOT)                                             │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • comp-login.md 🔒       │ → Output: login.go (code)                │
│  │ • artifacts/ 🔒          │                                          │
│  │ • integration.md 🔒      │                                          │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ Validation results    │                                          │
│  │ ❌ Previous iterations   │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (agent dies, context cleared)                              │
│                                                                         │
│  12-Layer Validation (AUTOMATED, NO AGENT)                             │
│  ┌──────────────────────────┐                                          │
│  │ • Run staticcheck        │ → Exit 0 = PASS                          │
│  │ • Run tests              │ → Exit != 0 = FAIL                       │
│  │ • Check coverage         │                                          │
│  │ • ... (10 more layers)   │                                          │
│  └──────────────────────────┘                                          │
│           ↓ (if FAIL, new agent for fix)                               │
│                                                                         │
│  Code Fixer (iteration N)                                              │
│  ┌──────────────────────────┐                                          │
│  │ Memory:                  │                                          │
│  │ • comp-login.md 🔒       │ → Output: login.go (FIXED)               │
│  │ • artifacts/ 🔒          │                                          │
│  │ • validation errors      │                                          │
│  │ • current code           │                                          │
│  │                          │                                          │
│  │ CANNOT SEE:              │                                          │
│  │ ❌ Original generator    │                                          │
│  │ ❌ Previous fix attempts │                                          │
│  │ ❌ Artifact generation   │                                          │
│  └──────────────────────────┘                                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## IV. DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WHAT GETS PASSED BETWEEN AGENTS                     │
└─────────────────────────────────────────────────────────────────────────┘

User Requirements (Input)
  │
  │ "Build analytics dashboard with real-time WebSocket updates"
  │
  ▼
┌──────────────────────┐
│   TIER 1 AGENT       │
│   (System Spec)      │
└──────────────────────┘
  │
  │ Output: system-spec.md (~5 pages)
  │ ┌────────────────────────────────────────────┐
  │ │ # System Specification                     │
  │ │ ## Subsystems                              │
  │ │ - Auth Subsystem                           │
  │ │ - Dashboard UI Subsystem                   │
  │ │ - Metrics API Subsystem                    │
  │ │ - Data Store Subsystem                     │
  │ │ ## Non-Functional Requirements             │
  │ │ - Scalability: 1000 concurrent users       │
  │ └────────────────────────────────────────────┘
  │
  │ 🔒 LOCKED (sha256: abc123...)
  │
  ├───────────┬───────────┬───────────┬───────────┐
  │           │           │           │           │
  ▼           ▼           ▼           ▼           ▼
┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
│TIER2│   │TIER2│   │TIER2│   │TIER2│   │ ... │
│ #1  │   │ #2  │   │ #3  │   │ #4  │   │     │
│Auth │   │Dash │   │API  │   │Store│   │     │
└─────┘   └─────┘   └─────┘   └─────┘   └─────┘
  │           │           │           │
  │ Each receives: system-spec.md 🔒 + ONE subsystem name
  │
  │ Output: subsystem-{name}.md (~8 pages each)
  │ ┌────────────────────────────────────────────┐
  │ │ # Subsystem: Auth                          │
  │ │ ## Components                              │
  │ │ - Login Component: User login workflow     │
  │ │ - Logout Component: Session termination    │
  │ │ - JWT Manager: Token generation/validation │
  │ │ - Session Store: Active session tracking   │
  │ │ ## Test Strategy                           │
  │ │ - Unit tests per component                 │
  │ └────────────────────────────────────────────┘
  │
  │ 🔒 LOCKED (sha256: def456...)
  │
  ├───────────┬───────────┬───────────┬───────────┐
  │           │           │           │           │
  ▼           ▼           ▼           ▼           ▼
┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐
│TIER3│   │TIER3│   │TIER3│   │TIER3│   │ ... │
│Login│   │Logout│  │JWT  │   │Sess │   │(12+)│
└─────┘   └─────┘   └─────┘   └─────┘   └─────┘
  │
  │ Each receives: subsystem-{parent}.md 🔒 + ONE component name
  │
  │ Output: comp-{name}.md (~12 pages each)
  │ ┌────────────────────────────────────────────┐
  │ │ # Component: Login                         │
  │ │ ## Functions                               │
  │ │ login(email, password) → (token, error)    │
  │ │   @pre: email is RFC 5322 format           │
  │ │   @post: returns JWT or error              │
  │ │   @error: InvalidEmail, WrongPassword      │
  │ │   Acceptance:                              │
  │ │   - Must reject invalid email format       │
  │ │   - Must hash password with bcrypt         │
  │ │   - Must return JWT with 24h expiry        │
  │ │   Tests:                                   │
  │ │   - Test valid login returns token         │
  │ │   - Test invalid email returns error       │
  │ │   - Test wrong password returns error      │
  │ │   - ... (8 total test cases)               │
  │ │                                            │
  │ │ validateEmail(email) → bool                │
  │ │   @pre: non-empty string                   │
  │ │   @post: true if RFC 5322 compliant        │
  │ │   ... (similar detail)                     │
  │ └────────────────────────────────────────────┘
  │
  │ 🔒 LOCKED (sha256: ghi789...)
  │
  └─────────────┬─────────────┬─────────────┬──────────────┐
                │             │             │              │
                └─────────────┴─────────────┴──────────────┘
                              │
                All comp-*.md 🔒 passed to:
                              │
                              ▼
                   ┌──────────────────────┐
                   │  TIER 4 AGENT        │
                   │  (Integration Spec)  │
                   └──────────────────────┘
                              │
  │ Output: integration.md (~10 pages)
  │ ┌────────────────────────────────────────────┐
  │ │ # Integration Specification                │
  │ │ ## Shared Types                            │
  │ │ UserID: UUID v4 string                     │
  │ │ Token: JWT string (format: xxx.yyy.zzz)    │
  │ │ Timestamp: ISO 8601 string                 │
  │ │                                            │
  │ │ ## Cross-Component Contracts               │
  │ │ Login → JWT Manager:                       │
  │ │   Input: (userID, claims map)              │
  │ │   Output: signed JWT string                │
  │ │                                            │
  │ │ Dashboard → Session Store:                 │
  │ │   Must validate token before queries       │
  │ │                                            │
  │ │ ## Data Flow                               │
  │ │ User → Login → JWT Manager → Session Store │
  │ │ Dashboard → Session Store → Metrics API    │
  │ └────────────────────────────────────────────┘
  │
  │ 🔒 LOCKED (sha256: jkl012...)
  │
  ▼
┌─────────────────────────────────────────────────────┐
│           ALL SPECS LOCKED (IMMUTABLE)              │
│                                                     │
│  system-spec.md        🔒 (sha256: abc123...)       │
│  subsystem-auth.md     🔒 (sha256: def456...)       │
│  subsystem-dashboard.md🔒 (sha256: mno345...)       │
│  subsystem-metrics.md  🔒 (sha256: pqr678...)       │
│  subsystem-store.md    🔒 (sha256: stu901...)       │
│  comp-login.md         🔒 (sha256: ghi789...)       │
│  comp-logout.md        🔒 (sha256: vwx234...)       │
│  comp-jwt.md           🔒 (sha256: yza567...)       │
│  ... (all 12+ components)                           │
│  integration.md        🔒 (sha256: jkl012...)       │
└─────────────────────────────────────────────────────┘
  │
  │ For EACH component, sequential workflow:
  │
  ├─────────────┬─────────────┬─────────────┬──────────────┐
  │             │             │             │              │
  ▼             ▼             ▼             ▼              ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      ┌─────────┐
│ARTIFACT │ │ARTIFACT │ │ARTIFACT │ │ARTIFACT │ ...  │ARTIFACT │
│GEN      │ │GEN      │ │GEN      │ │GEN      │      │GEN      │
│(Login)  │ │(Logout) │ │(JWT)    │ │(Session)│      │(Comp12) │
└─────────┘ └─────────┘ └─────────┘ └─────────┘      └─────────┘
  │
  │ Each receives:
  │   comp-{name}.md 🔒
  │   integration.md 🔒
  │
  │ Output: artifacts/{component}/
  │ ┌────────────────────────────────────────────┐
  │ │ correspondence-login.json                  │
  │ │ {                                          │
  │ │   "login_function": {                      │
  │ │     "layers": [                            │
  │ │       "spec: login(email, password)",      │
  │ │       "artifact: test_valid_login()",      │
  │ │       "code: func Login(e, p) {...}",      │
  │ │       "validation: Layer2 test passes"     │
  │ │     ]                                      │
  │ │   }                                        │
  │ │ }                                          │
  │ │                                            │
  │ │ completeness-login.json                    │
  │ │ {                                          │
  │ │   "acceptance_criteria": [                 │
  │ │     {"criterion": "reject invalid email",  │
  │ │      "test": "test_invalid_email_rejected",│
  │ │      "coverage": "line 45-52"},            │
  │ │     ...                                    │
  │ │   ]                                        │
  │ │ }                                          │
  │ │                                            │
  │ │ test-requirements-login.md                 │
  │ │ architecture-baseline-login.json           │
  │ └────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────┐
│ ARTIFACT AUDITOR     │ ← FRESH AGENT (independent context)
│ (Independent Check)  │
└──────────────────────┘
  │
  │ Receives:
  │   comp-{name}.md 🔒
  │   artifacts/ (above)
  │
  │ Output: PASS or FAIL
  │
  │ If FAIL → regenerate artifacts (loop until PASS)
  │ If PASS → 🔒 LOCK artifacts
  │
  ▼
┌─────────────────────────────────────────────────────┐
│    ARTIFACTS LOCKED (IMMUTABLE)                     │
│                                                     │
│  artifacts/login/                                   │
│    correspondence-login.json     🔒                 │
│    completeness-login.json       🔒                 │
│    test-requirements-login.md    🔒                 │
│    architecture-baseline-login.json 🔒              │
│                                                     │
│  artifacts/logout/... 🔒                            │
│  artifacts/jwt/... 🔒                               │
│  ... (all components)                               │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────┐
│  CODE GENERATOR      │ ← FRESH AGENT (one-shot)
│  (ONE-SHOT)          │
└──────────────────────┘
  │
  │ Receives:
  │   comp-{name}.md 🔒
  │   artifacts/{name}/ 🔒
  │   integration.md 🔒
  │   language: "go"
  │
  │ Output: login.go (or .ts, .py, .sh)
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  12-LAYER VALIDATION (Automated, No Agent)           │
│                                                      │
│  Layer -1: go build && go vet && go test            │
│  Layer  0: staticcheck                              │
│  Layer  1: Contract annotations present             │
│  Layer  2: Test coverage ≥ 80%                      │
│  Layer  3: Anti-hollow patterns                     │
│  Layer  4: gosec + govulncheck                      │
│  Layer  5: gocyclo complexity ≤ 15                  │
│  Layer  6: Convergence (Δ < 2%)                     │
│  Layer  7: Correspondence matrix satisfied          │
│  Layer  8: Completeness manifest satisfied          │
│  Layer  9: Artifact chain intact                    │
│  Layer 10: Determinism verified                     │
│                                                      │
│  Exit 0 = ALL PASS → ✅ Component validated         │
│  Exit != 0 = FAIL → Enter fix loop                  │
└──────────────────────────────────────────────────────┘
  │
  │ If FAIL:
  ▼
┌──────────────────────┐
│  CODE FIXER          │ ← FRESH AGENT (each iteration)
│  (Iteration N)       │
└──────────────────────┘
  │
  │ Receives:
  │   comp-{name}.md 🔒 (IMMUTABLE)
  │   artifacts/{name}/ 🔒 (IMMUTABLE)
  │   current code (login.go)
  │   validation errors
  │
  │ Output: login.go (FIXED)
  │
  │ Loop: Re-run 12-layer validation
  │       If still FAIL → new fresh agent
  │       If PASS → ✅ Component validated
  │
  ▼
┌──────────────────────────────────────────────────────┐
│            ALL COMPONENTS VALIDATED                  │
│                                                      │
│  ✅ login.go      (12 layers passed)                 │
│  ✅ logout.go     (12 layers passed)                 │
│  ✅ jwt.go        (12 layers passed)                 │
│  ✅ session.go    (12 layers passed)                 │
│  ✅ ... (all 12+ components)                         │
└──────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────┐
│        INTEGRATION TEST (Phase 4)                    │
│                                                      │
│  End-to-end workflow test:                          │
│  User → Login → Get Token → Dashboard → Metrics     │
│                                                      │
│  If PASS → ✅ PRODUCTION READY                       │
│  If FAIL → Manual investigation required             │
└──────────────────────────────────────────────────────┘
```

---

## V. IMMUTABILITY ENFORCEMENT

```
┌───────────────────────────────────────────────────────────────────────┐
│                       🔒 LOCK MECHANISM                               │
│  Purpose: Prevent spec/artifact adjustment to match bad code         │
└───────────────────────────────────────────────────────────────────────┘

When spec is approved:
  ┌─────────────────────────────────┐
  │ system-spec.md (5 KB)           │
  │ ┌─────────────────────────────┐ │
  │ │ # System Specification      │ │
  │ │ ## Subsystems               │ │
  │ │ - Auth Subsystem            │ │
  │ │ - Dashboard UI Subsystem    │ │
  │ │ ...                         │ │
  │ └─────────────────────────────┘ │
  └─────────────────────────────────┘
         │
         │ sha256sum system-spec.md > system-spec.md.lock
         ▼
  ┌─────────────────────────────────┐
  │ system-spec.md.lock             │
  │ ┌─────────────────────────────┐ │
  │ │ abc123def456...             │ │
  │ │ system-spec.md              │ │
  │ └─────────────────────────────┘ │
  └─────────────────────────────────┘

Now spec is 🔒 IMMUTABLE:
  ❌ Agent cannot modify system-spec.md
  ❌ Even if code fails validation
  ❌ Spec hash is verified before every phase

If someone tries to modify spec:
  ┌─────────────────────────────────┐
  │ system-spec.md (MODIFIED)       │
  └─────────────────────────────────┘
         │
         │ sha256sum system-spec.md
         ▼
  ┌─────────────────────────────────┐
  │ xyz789abc012... (NEW HASH)      │
  └─────────────────────────────────┘
         │
         │ Compare with lock file
         ▼
  ┌─────────────────────────────────┐
  │ abc123def456... (ORIGINAL)      │
  └─────────────────────────────────┘
         │
         ▼
  ❌ HASH MISMATCH → ABORT BUILD
  "Spec has been modified after locking!"

This forces:
  ✅ Code must match spec
  ✅ Cannot adjust spec to match bad code
  ✅ If code fails validation, must fix CODE, not spec
  ✅ Audit trail: locked specs prove requirements
```

---

## VI. PARALLEL VS SEQUENTIAL EXECUTION

```
┌───────────────────────────────────────────────────────────────────────┐
│                   TIER 2: PARALLEL EXECUTION                          │
│  Why: Subsystems are independent, can spec simultaneously             │
└───────────────────────────────────────────────────────────────────────┘

Time: t=0
┌────────────────┐
│ system-spec.md │ 🔒
└────────────────┘
        │
        │ Launch 4 agents simultaneously
        │
  ┌─────┼─────┬─────┬─────┐
  │     │     │     │     │
  ▼     ▼     ▼     ▼     ▼
┌────┐┌────┐┌────┐┌────┐┌────┐
│Auth││Dash││Metr││Data││... │  ← All agents working in parallel
└────┘└────┘└────┘└────┘└────┘
  │     │     │     │     │
  │     │     │     │     │     (Time: t=0 to t=10min)
  ▼     ▼     ▼     ▼     ▼
┌────┐┌────┐┌────┐┌────┐┌────┐
│Done││Done││Done││Done││Done│  ← All finish around same time
└────┘└────┘└────┘└────┘└────┘

Total time: ~10 minutes (vs 40 minutes if sequential)

┌───────────────────────────────────────────────────────────────────────┐
│                  TIER 3: SEQUENTIAL EXECUTION                         │
│  Why: User reviews each component spec carefully                     │
│       Components may depend on each other                            │
└───────────────────────────────────────────────────────────────────────┘

Time: t=0
┌──────────────────┐
│ subsystem-auth.md│ 🔒
└──────────────────┘
        │
        ▼
┌─────────────────┐
│ Agent: Login    │ ← Agent 1 works
└─────────────────┘
        │ (10 minutes)
        ▼
┌─────────────────┐
│ comp-login.md   │ 🔒
└─────────────────┘
        │ User reviews and approves
        ▼
┌─────────────────┐
│ Agent: Logout   │ ← Agent 2 works (sees Login is done)
└─────────────────┘
        │ (10 minutes)
        ▼
┌─────────────────┐
│ comp-logout.md  │ 🔒
└─────────────────┘
        │ User reviews and approves
        ▼
┌─────────────────┐
│ Agent: JWT      │ ← Agent 3 works
└─────────────────┘
        │ (10 minutes)
        ▼
┌─────────────────┐
│ comp-jwt.md     │ 🔒
└─────────────────┘

Total time: ~30 minutes for 3 components (sequential)
```

---

**End of Visual Guide**
