/**
 * Tier 3: Component Specification Generation (SEQUENTIAL with user review)
 *
 * For each component, generates a detailed function-level spec
 * Output: ~12 pages per component
 * MVP: Basic implementation (registry + review package deferred)
 */

import { getLLMClient } from '../utils/llm.js';

interface Component {
  component: string;
  subsystem: string;
}

export async function generateComponentSpecs(
  subsystemSpecs: Map<string, string>,
  components: Component[]
): Promise<Map<string, string>> {
  console.log(`  Generating ${components.length} component specs sequentially...`);

  const specs = new Map<string, string>();

  for (const { component, subsystem } of components) {
    console.log(`\n  📝 Component: ${component}`);

    const spec = await generateDetailedSpec(component, subsystem, subsystemSpecs.get(subsystem)!);

    // MVP: Auto-approve for now (TODO: add user approval + registry + review package)
    console.log(`    ⚠️ MVP: Auto-approving ${component}`);

    specs.set(component, spec);
    console.log(`    ✓ ${component} spec complete`);
  }

  return specs;
}

async function generateDetailedSpec(
  component: string,
  subsystem: string,
  subsystemSpec: string
): Promise<string> {
  const llm = getLLMClient();
  const response = await llm.prompt(`Generate a Tier 3 Component Specification.

**Subsystem Context:**
${subsystemSpec}

**Your Focus:** Component "${component}" in subsystem "${subsystem}"

**Your Task:**
Generate a detailed component specification (~12 pages) with FUNCTION-LEVEL design:

1. Component Overview
2. Data Model (types, structures)
3. Functions (with full signatures, pre/post conditions, error handling)
4. Error Handling Strategy
5. Acceptance Criteria (specific, measurable)
6. Test Requirements (concrete test cases)

**Output Format:**
# Component: ${component}

## Overview
[What does this component do? Why does it exist?]

## Data Model
\`\`\`
interface/struct/class definitions
\`\`\`

## Functions
### \`functionName(param1: Type, param2: Type) → ReturnType\`
**Purpose:** [What does this function do?]
**@pre:** Preconditions (what must be true before calling)
**@post:** Postconditions (what will be true after calling)
**@error:** Error cases and how they're handled

**Acceptance Criteria:**
- GIVEN [scenario] WHEN [action] THEN [specific measurable outcome]
- ...

**Test Requirements:**
- Test: [specific input] → [expected output]
- Error test: [invalid input] → [expected error]

### [Next function...]

## Error Handling
[How does this component handle errors? Propagation strategy?]

## Dependencies
**Imports (what this component needs):**
- From: [component/subsystem] | What: [function/type/data] | Contract: [interface]

**Exports (what this component provides):**
- [What other components can use]

**CRITICAL REQUIREMENTS:**
1. ALL acceptance criteria must be SPECIFIC and MEASURABLE (not "should work well")
2. ALL test requirements must have CONCRETE inputs and expected outputs
3. ALL function signatures must include @pre/@post/@error annotations
4. Data flows (consumes/produces) must be clearly specified
`);

  return response.content;
}
