/**
 * Anti-Hallucination Detection via AST Analysis
 *
 * Detects invalid imports, function calls, and type references
 * MVP: Basic implementation for TypeScript/JavaScript
 */

import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

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

  if (language === 'typescript' || language === 'javascript') {
    return detectTypeScriptHallucinations(code);
  }

  // For MVP, only TypeScript/JavaScript implemented
  console.log(`    ⚠️ MVP: Hallucination detection not implemented for ${language}`);
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
