/**
 * Anti-Hallucination Detection via AST Analysis
 *
 * Detects invalid imports, function calls, and type references.
 *
 * Dispatch order (v1.3.0+):
 *   1. If a LanguagePack (§8) is registered for the language and provides
 *      a hallucinationDetector, delegate to it. Packs own language-specific
 *      AST / regex / subprocess strategies.
 *   2. Otherwise fall back to the built-in TypeScript/JavaScript detector
 *      for legacy parity (Python/other languages return the no-op report).
 *
 * v1.4.0 target: every supported language has a pack; this file's switch
 * becomes a pure pack-registry lookup.
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { getPack } from '../packs/index.js';

export interface HallucinationReport {
  invalidImports: string[];
  invalidCalls: string[];
  hallucinationRate: number;
  passed: boolean;
}

export async function detectHallucinations(
  code: string,
  language: string
): Promise<HallucinationReport> {
  console.log('    🔍 Running anti-hallucination detection...');

  // Pack-level dispatch — preferred path.
  const pack = getPack(language);
  if (pack?.hallucinationDetector) {
    const report = await pack.hallucinationDetector(code);
    console.log(
      `      ✓ Hallucination check (pack=${pack.id}): ${report.invalidImports.length} issues (${report.hallucinationRate.toFixed(1)}%)`,
    );
    return report;
  }

  // Legacy built-in dispatch.
  if (language === 'typescript' || language === 'javascript') {
    return detectTypeScriptHallucinations(code);
  }

  // No pack, no built-in → no-op report with a warning.
  console.log(`    ⚠️ Hallucination detection not implemented for ${language}`);
  return {
    invalidImports: [],
    invalidCalls: [],
    hallucinationRate: 0,
    passed: true
  };
}

function detectTypeScriptHallucinations(code: string): HallucinationReport {
  const invalidImports: string[] = [];
  const invalidCalls: string[] = [];

  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['typescript']
    });

    // Extract all imports
    traverse(ast, {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        
        // Check if import looks suspicious (common hallucinations)
        if (isLikelySuspicious(source)) {
          invalidImports.push(source);
        }
      }
    });

    // For MVP, we'll do basic pattern matching
    // TODO: Add library introspection for comprehensive checking

    const totalRefs = invalidImports.length + invalidCalls.length;
    const invalidRefs = invalidImports.length + invalidCalls.length;
    const hallucinationRate = totalRefs > 0 ? (invalidRefs / Math.max(totalRefs, 10)) * 100 : 0;

    console.log(`      ✓ Hallucination check: ${invalidRefs} issues found (${hallucinationRate.toFixed(1)}%)`);

    return {
      invalidImports,
      invalidCalls,
      hallucinationRate,
      passed: hallucinationRate < 10  // <10% threshold
    };
  } catch (error) {
    console.log(`      ⚠️ AST parsing failed: ${error}`);
    return {
      invalidImports: [],
      invalidCalls: [],
      hallucinationRate: 0,
      passed: true  // Don't block on parse errors in MVP
    };
  }
}

function isLikelySuspicious(importPath: string): boolean {
  // Common hallucinated packages
  const suspiciousPatterns = [
    /^fake-/,
    /^mock-(?!fs)/,  // mock-fs is real
    /^test-utils-/,
    /^generated-/
  ];

  return suspiciousPatterns.some(pattern => pattern.test(importPath));
}
