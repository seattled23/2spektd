/**
 * spec2-resume - Resume build from checkpoint
 *
 * Loads the latest checkpoint and resumes the orchestrator from the
 * wave AFTER the checkpoint's recorded phase. The orchestrator skips
 * completed waves and re-enters the pipeline with rehydrated state.
 *
 * Agent isolation is preserved: resumed waves launch the same fresh
 * agents as a clean run. Checkpoint state lives only in the Node
 * process — it's never shown to an LLM.
 */

import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Inline minimal Checkpoint shape (avoids cross-directory TS rootDir issues).
// Actual checkpoint shape lives in ../spec2/utils/checkpoint.ts.
interface Checkpoint {
  phase: 'wave1' | 'wave2' | 'wave3' | 'wave4' | 'wave5' | 'wave6' | 'complete';
  timestamp: string;
  requirements: string;
  language: string;
  systemSpec?: string;
  subsystems?: string[];
  subsystemSpecs?: Record<string, string>;
  components?: string[];
  componentSpecs?: Record<string, string>;
  integrationSpec?: string;
  artifacts?: Record<string, any>;
  generatedComponents?: string[];
}

interface BuildResult {
  components: string[];
  validationStatus: 'PASSED' | 'FAILED';
  outputPath: string;
}

export async function execute(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        Spec2: Resume from Checkpoint                  ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const checkpointPath = '.spec2/checkpoints/latest.json';

  if (!existsSync(checkpointPath)) {
    console.error('\n❌ NO CHECKPOINT FOUND\n');
    console.log('No checkpoint file found at .spec2/checkpoints/latest.json');
    console.log('\nTo start a new build:');
    console.log('  /spec2-new "your requirements here"');
    return;
  }

  let checkpoint: Checkpoint;
  try {
    const content = readFileSync(checkpointPath, 'utf8');
    checkpoint = JSON.parse(content);
  } catch (error) {
    console.error('\n❌ ERROR READING CHECKPOINT');
    console.error(error instanceof Error ? error.message : String(error));
    return;
  }

  if (checkpoint.phase === 'complete') {
    console.log('\n✅ BUILD ALREADY COMPLETE\n');
    console.log('This project has already finished all waves.');
    console.log('\nTo start a new build:');
    console.log('  /spec2-new "your requirements here"');
    return;
  }

  console.log(`\nCheckpoint found:`);
  console.log(`  Last completed: ${checkpoint.phase}`);
  console.log(`  Timestamp: ${checkpoint.timestamp}`);
  console.log(`  Language: ${checkpoint.language}`);
  console.log(`  Components: ${(checkpoint.components ?? []).length}`);
  console.log(`  Resuming from wave after ${checkpoint.phase}...\n`);

  // Dynamic import of the sibling spec2 skill's compiled orchestrator.
  // Resolved relative to this file, so it works whether invoked from
  // the source tree or an installed harness location — as long as the
  // spec2 skill is built (its dist/ exists alongside this skill).
  // Walk up from this file (compiled into dist/resume.js) to the skills/
  // directory, then into the sibling spec2 skill's dist/.
  // Works whether invoked from source tree or installed location, as long
  // as the spec2 skill's dist/ is a sibling directory.
  const here = dirname(fileURLToPath(import.meta.url));
  const orchestratorPath = resolve(here, '..', '..', 'spec2', 'dist', 'orchestrate.js');

  if (!existsSync(orchestratorPath)) {
    console.error(`\n❌ ORCHESTRATOR NOT FOUND\n`);
    console.error(`Expected compiled orchestrator at: ${orchestratorPath}`);
    console.error(`Build the main spec2 skill first:`);
    console.error(`  cd ${resolve(here, '../spec2')} && npm run build`);
    return;
  }

  let mod: {
    orchestrateSpec2FromCheckpoint: (cp: Checkpoint) => Promise<BuildResult>;
  };
  try {
    mod = (await import(orchestratorPath)) as any;
  } catch (error) {
    console.error('\n❌ FAILED TO LOAD ORCHESTRATOR');
    console.error(error instanceof Error ? error.message : String(error));
    return;
  }

  try {
    const result = await mod.orchestrateSpec2FromCheckpoint(checkpoint);
    console.log('\n✅ RESUME COMPLETE');
    console.log(`Components generated: ${result.components.length}`);
    console.log(`Validation status: ${result.validationStatus}`);
    console.log(`Output path: ${result.outputPath}`);
  } catch (error) {
    console.error('\n❌ RESUME FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nCheckpoint preserved at .spec2/checkpoints/latest.json');
    console.error('Investigate, fix, and re-run /spec2-resume.');
    throw error;
  }
}
