/**
 * Tier 2: Subsystem Specification Generation (PARALLEL)
 *
 * For each subsystem, generates a detailed spec identifying components
 * Output: ~8 pages per subsystem
 */

import { getLLMClient } from '../utils/llm.js';

export async function generateSubsystemSpecs(
  systemSpec: string,
  subsystems: string[]
): Promise<Map<string, string>> {
  console.log(`  Launching ${subsystems.length} Tier 2 agents in parallel...`);

  const llm = getLLMClient();

  // Launch all subsystem spec generations in parallel
  const promises = subsystems.map(async (subsystem) => {
    const response = await llm.prompt(`Generate a Tier 2 Subsystem Specification.

**System Context:**
${systemSpec}

**Your Focus:** ${subsystem}

**Your Task:**
Generate a detailed subsystem specification (~8 pages) that identifies:
1. Subsystem Overview
2. Components (WHAT components exist in this subsystem, not function-level design)
3. Dependencies (what this subsystem needs from other subsystems)
4. Test Strategy (how to test this subsystem)

**Scope:**
- Identify COMPONENTS only (not individual functions yet - that's Tier 3)
- Each component should have: name, purpose, key responsibilities
- Focus on what EXISTS, not how it's implemented

**Output Format:**
# Subsystem: ${subsystem}

## Overview
[What does this subsystem do? How does it fit in the system?]

## Components
### Component: [Name]
**Purpose:** [What does this component do?]
**Responsibilities:**
- [Responsibility 1]
- [Responsibility 2]

### Component: [Name]
...

## Dependencies
**Requires from other subsystems:**
- [Subsystem A]: [What is needed]
- [Subsystem B]: [What is needed]

**Provides to other subsystems:**
- [What this subsystem exposes]

## Test Strategy
- [How to test this subsystem]
- [Key test scenarios]

**CRITICAL:** Identify the RIGHT components. Tier 3 will design each component in detail.
`);

    console.log(`    ✓ ${subsystem} spec generated (${response.content.length} chars) [${response.provider}]`);

    return [subsystem, response.content] as [string, string];
  });

  const results = await Promise.all(promises);
  const specsMap = new Map(results);

  console.log(`  ✓ All ${subsystems.length} subsystem specs complete`);

  return specsMap;
}
