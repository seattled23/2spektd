/**
 * spec2-new - Requirements-to-code generation with comprehensive validation
 *
 * Entry point for the executable skill.
 */

import { orchestrateSpec2 } from './orchestrate.js';

export interface SkillArgs {
  requirements: string;
  language?: 'python' | 'typescript' | 'go' | 'java';
}

export async function execute(args: SkillArgs): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        Spec2: Building with Full Validation           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    const result = await orchestrateSpec2(
      args.requirements,
      args.language || 'typescript'
    );

    console.log('\n✅ BUILD COMPLETE');
    console.log(`Components generated: ${result.components.length}`);
    console.log(`Validation status: ${result.validationStatus}`);
    console.log(`Output path: ${result.outputPath}`);
  } catch (error) {
    console.error('\n❌ BUILD FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
