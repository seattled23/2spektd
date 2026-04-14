/**
 * Code Generation & Validation Loop with Verification Checkpoints
 */

import { getLLMClient } from '../utils/llm.js';
import * as fs from 'fs/promises';
import { detectHallucinations } from '../verification/anti-hallucination.js';

export async function generateAndValidateCode(
  componentSpec: string,
  component: string,
  integrationSpec: string,
  language: string,
  outputPath: string,
  systemSpec: string = ''
): Promise<void> {
  console.log(`    💻 Generating code for ${component}...`);

  // One-shot code generation
  const code = await generateCode(componentSpec, integrationSpec, language, systemSpec);

  // Save code
  await fs.mkdir(outputPath.substring(0, outputPath.lastIndexOf('/')), { recursive: true });
  await fs.writeFile(outputPath, code, 'utf-8');

  // Run anti-hallucination detection
  const hallucReport = await detectHallucinations(code, language);

  if (!hallucReport.passed) {
    console.log(`      ❌ Hallucination check FAILED`);
    console.log(`         Invalid imports: ${hallucReport.invalidImports.join(', ')}`);
    throw new Error(`Code contains hallucinations: ${hallucReport.hallucinationRate}% invalid references`);
  }

  console.log(`      ✅ Code validation passed`);
}

async function generateCode(
  componentSpec: string,
  integrationSpec: string,
  language: string,
  systemSpec: string = ''
): Promise<string> {
  const llm = getLLMClient();
  const systemContextBlock = systemSpec
    ? `**SYSTEM CONTEXT (read-only, for NFR awareness — performance/security targets):**
${systemSpec}

---

`
    : '';
  const response = await llm.prompt(`Generate production-ready code from this specification.

${systemContextBlock}**Component Specification (YOUR IMPLEMENTATION TARGET):**
${componentSpec}

**Integration Specification:**
${integrationSpec}

**Target Language:** ${language}

**Your Task:**
Generate complete, production-ready code that implements this specification.

**Requirements:**
1. Implement ALL functions defined in the spec
2. Include type definitions from the data model
3. Add error handling as specified
4. Include JSDoc/comments for public APIs
5. Follow ${language} best practices and idioms

**Critical:**
- Only use standard library and common packages (no fake/generated/non-existent packages)
- All imports must be from real, published packages
- Implement actual logic, not placeholders

Generate ONLY the code (no explanations).
`);

  return response.content;
}
