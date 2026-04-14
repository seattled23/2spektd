/**
 * Code Generation & Validation Loop with Verification Checkpoints.
 *
 * Wave 6 entry point. For each component, this:
 *   1. Resolves the LanguagePack (§8) for the target language.
 *   2. Prompts the LLM with component spec + integration spec + pack
 *      codegen template (if available).
 *   3. Writes the generated file.
 *   4. Runs anti-hallucination (pack-aware via detectHallucinations).
 *   5. Runs pack-registered quality adapters against the file.
 *
 * Pack quality-tool runs emit warnings/errors into the component log but
 * are NOT fatal by default — §9.7 locks "tool-missing is non-fatal" and we
 * extend that to "tool-found-but-found-issues" for v1.3.0 to avoid blocking
 * the pipeline on lint noise. Errors show up in the visual review package.
 */

import { getLLMClient } from '../utils/llm.js';
import * as fs from 'fs/promises';
import { detectHallucinations } from '../verification/anti-hallucination.js';
import { getPack } from '../packs/index.js';
import { runAll } from '../quality/adapter.js';

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

  // Run anti-hallucination detection (pack-aware dispatch inside)
  const hallucReport = await detectHallucinations(code, language);

  if (!hallucReport.passed) {
    console.log(`      ❌ Hallucination check FAILED`);
    console.log(`         Invalid imports: ${hallucReport.invalidImports.join(', ')}`);
    throw new Error(`Code contains hallucinations: ${hallucReport.hallucinationRate}% invalid references`);
  }

  // Run pack quality tools (§9). Non-fatal — issues surface in reports
  // but do not block the wave. Missing tools also do not block.
  const pack = getPack(language);
  if (pack && pack.qualityTools.length > 0) {
    const batch = await runAll(pack.qualityTools, {
      code,
      path: outputPath,
      timeoutMs: 60_000,
    });
    const errorCount = batch.issues.filter(i => i.severity === 'error').length;
    const warnCount = batch.issues.filter(i => i.severity === 'warning').length;
    const missingNote = batch.missing.length
      ? ` (missing: ${batch.missing.join(', ')})`
      : '';
    console.log(
      `      🔧 Quality tools [${pack.id}]: ${batch.installed}/${batch.totalAdapters} ran, ` +
      `${errorCount} errors, ${warnCount} warnings${missingNote}`,
    );
    if (batch.timedOut.length) {
      console.log(`         ⚠️ Timed out: ${batch.timedOut.join(', ')}`);
    }
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

  // Pack-specific codegen guidance, if this language has a pack registered.
  const pack = getPack(language);
  const packBlock = pack
    ? `

---

${pack.codegenPromptTemplate}
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
${packBlock}
Generate ONLY the code (no explanations).
`);

  return response.content;
}
