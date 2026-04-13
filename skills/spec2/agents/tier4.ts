/**
 * Tier 4: Integration Specification Generation
 *
 * MVP: Simplified version without registry (loads component specs directly)
 * TODO: Add registry querying for production
 */

import { getLLMClient } from '../utils/llm.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function generateIntegrationSpec(): Promise<string> {
  console.log('  Generating Tier 4: Integration Specification...');

  // MVP: Load component specs from disk
  const specsDir = '.spec2/specs';
  const componentFiles = (await fs.readdir(specsDir))
    .filter(f => f.startsWith('comp-') && f.endsWith('.md'));

  const componentSpecs: string[] = [];
  for (const file of componentFiles) {
    const content = await fs.readFile(path.join(specsDir, file), 'utf-8');
    componentSpecs.push(content);
  }

  console.log(`  Found ${componentSpecs.length} component specs`);

  // Generate integration spec
  const llm = getLLMClient();
  const response = await llm.prompt(`Generate a Tier 4 Integration Specification.

**Component Specs:**
${componentSpecs.join('\n\n---\n\n')}

**Your Task:**
Generate an integration specification (~10 pages) that defines:
1. Shared Type Definitions (types used by multiple components)
2. Interface Contracts (how components communicate)
3. Data Flow Specification (what data moves between components)
4. Cross-Cutting Standards (authentication, logging, error handling conventions)

**Output Format:**
# Integration Specification

## Shared Types
\`\`\`
// Types used across multiple components
\`\`\`

## Interface Contracts
### Contract: [Component A] ↔ [Component B]
**Purpose:** [Why do they interact?]
**Interface:**
- [Component A provides]: [function/data]
- [Component B consumes]: [function/data]
**Data Format:** [specific format/schema]

## Data Flows
[Diagram or description of data movement]

## Cross-Cutting Standards
- **Authentication:** [how auth tokens are formatted/passed]
- **Logging:** [logging format/levels]
- **Error Handling:** [error propagation strategy]

**CRITICAL:** Resolve any naming conflicts or inconsistent contracts found in components.
`);

  console.log(`  ✓ Integration spec generated (${response.content.length} chars) [${response.provider}/${response.model}]`);

  return response.content;
}
