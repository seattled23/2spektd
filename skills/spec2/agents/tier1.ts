/**
 * Tier 1: System Specification Generation
 *
 * Generates high-level system architecture (WHAT subsystems exist, not HOW)
 * Output: ~5 pages identifying major subsystems and their purposes
 */

import { getLLMClient } from '../utils/llm.js';

export async function generateSystemSpec(requirements: string): Promise<string> {
  console.log('  Launching Tier 1 agent (odin:architect)...');

  const llm = getLLMClient();
  const response = await llm.prompt(`Generate a Tier 1 System Specification from these requirements.

**Requirements:**
${requirements}

**Your Task:**
Generate a high-level system architecture specification (~5 pages) that identifies:
1. System Overview (1-2 paragraphs describing the overall purpose)
2. Major Subsystems (WHAT subsystems are needed, not HOW they work)
3. Non-Functional Requirements (performance, security, scalability)

**Scope:**
- Focus on SUBSYSTEM identification only
- Do NOT design components or functions yet (that's Tier 2/3)
- Each subsystem should have: name, purpose, key responsibilities

**Output Format:**
# System Specification

## System Overview
[1-2 paragraphs describing what the system does]

## Subsystems
### Subsystem: [Name]
**Purpose:** [What does this subsystem do?]
**Key Responsibilities:**
- [Responsibility 1]
- [Responsibility 2]
...

### Subsystem: [Name]
...

## Non-Functional Requirements
- **Performance:** [targets]
- **Security:** [requirements]
- **Scalability:** [considerations]

**CRITICAL:** Focus on identifying the RIGHT subsystems. The rest of the build depends on this.
`);

  console.log(`  ✓ Tier 1 spec generated (${response.content.length} chars) [${response.provider}/${response.model}]`);

  return response.content;
}
