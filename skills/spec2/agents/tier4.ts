/**
 * Tier 4: Integration Specification Generation
 *
 * Uses the Integration Registry to query component public surfaces instead
 * of loading full component spec files verbatim. For N components × ~12 pages
 * each, verbatim loading can exceed 15K tokens; the registry summary targets
 * <2K chars for 5 components — roughly a 10x token reduction at this tier.
 *
 * Agent isolation contract (ROADMAP §1.1):
 * - Registry is orchestrator-local state; it is NEVER passed to an LLM.
 * - Only `getRegistrySummary()` output enters the prompt, and only as a
 *   curated PUBLIC-SURFACE view (function signatures, types, cross-component
 *   links). Internal metadata (parse_warnings, row ids, ingested_at) is
 *   excluded by the registry module.
 * - The SYSTEM CONTEXT block (systemSpec) is preserved unchanged per v1.1.0
 *   Tier context refinement — it flows as read-only NFR context.
 */

import { getLLMClient } from '../utils/llm.js';
import { getRegistry } from '../registry/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsSync from 'fs';

export async function generateIntegrationSpec(systemSpec: string = ''): Promise<string> {
  console.log('  Generating Tier 4: Integration Specification...');

  // Build the component context block.
  // Primary path: query the integration registry (compact public-surface summary).
  // Fallback: load full component specs from disk if the registry is unavailable
  //           (e.g., running against a v1.1.0 checkpoint that predates the registry).
  const componentContextBlock = await buildComponentContext();

  const llm = getLLMClient();
  const systemContextBlock = systemSpec
    ? `**SYSTEM CONTEXT (read-only, for NFR awareness — DO NOT redesign from this):**
${systemSpec}

---

`
    : '';

  const response = await llm.prompt(`Generate a Tier 4 Integration Specification.

${systemContextBlock}**Component Specs (YOUR TARGETS — define contracts between these):**
${componentContextBlock}

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

/**
 * Build the component context string for the Tier 4 prompt.
 *
 * Tries the registry first (compact JSON summary of public surfaces).
 * Falls back to reading full component spec files from disk if the registry
 * is not initialized or has no components (e.g., old checkpoint, testing).
 *
 * The returned string is the ONLY component data that reaches the LLM.
 * It is a curated public-surface view — never the full spec text.
 */
async function buildComponentContext(): Promise<string> {
  // Try registry
  try {
    const registry = getRegistry();
    const count = registry.componentCount();
    if (count > 0) {
      const summary = registry.getRegistrySummary();
      console.log(`  Using registry summary (${count} components, public surfaces only)`);
      return formatRegistrySummary(summary);
    }
  } catch {
    // Registry not initialized — fall through to disk fallback
  }

  // Fallback: load component spec files from disk (pre-registry path)
  console.log('  Registry unavailable — falling back to disk-based component specs');
  const specsDir = '.spec2/specs';
  try {
    const files = await fs.readdir(specsDir);
    const componentFiles = files.filter(f => f.startsWith('comp-') && f.endsWith('.md'));
    const componentSpecs: string[] = [];
    for (const file of componentFiles) {
      const content = await fs.readFile(path.join(specsDir, file), 'utf-8');
      componentSpecs.push(content);
    }
    console.log(`  Found ${componentSpecs.length} component spec(s) on disk`);
    return componentSpecs.join('\n\n---\n\n');
  } catch {
    return '(No component specs available — this is an early-stage build)';
  }
}

/**
 * Format a RegistrySummary into a compact prompt-safe string.
 *
 * Output is structured markdown that gives Tier 4 the public surface of each
 * component without exposing internal metadata or full spec verbatim content.
 */
function formatRegistrySummary(summary: import('../registry/index.js').RegistrySummary): string {
  const lines: string[] = [
    `[Registry summary: ${summary.componentCount} component(s)]`,
    '',
  ];

  for (const comp of summary.components) {
    lines.push(`### Component: ${comp.name} (subsystem: ${comp.subsystem})`);

    if (comp.publicFunctions.length > 0) {
      lines.push('**Public Functions:**');
      for (const fn of comp.publicFunctions) {
        lines.push(`- ${fn}`);
      }
    }

    if (comp.publicTypes.length > 0) {
      lines.push('**Types:**');
      for (const t of comp.publicTypes) {
        lines.push(`- ${t}`);
      }
    }

    if (comp.exports.length > 0) {
      lines.push('**Exports:**');
      for (const ex of comp.exports) {
        lines.push(`- ${ex}`);
      }
    }

    if (comp.importedFrom.length > 0) {
      lines.push('**Imports from:**');
      for (const im of comp.importedFrom) {
        lines.push(`- ${im}`);
      }
    }

    lines.push('');
  }

  if (summary.sharedTypes.length > 0) {
    lines.push('### Shared Types (used by ≥2 components)');
    for (const t of summary.sharedTypes) {
      lines.push(`- **${t.name}**: ${t.purpose || '(no purpose recorded)'} [used by: ${t.usedBy.join(', ')}]`);
    }
    lines.push('');
  }

  if (summary.crossComponentLinks.length > 0) {
    lines.push('### Cross-Component Dependencies');
    for (const link of summary.crossComponentLinks) {
      lines.push(`- ${link.source} → ${link.target} :: ${link.symbol}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
