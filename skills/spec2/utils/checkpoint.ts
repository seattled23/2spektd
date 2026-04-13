/**
 * Checkpoint system for resuming interrupted builds
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';

export interface Checkpoint {
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

export function saveCheckpoint(checkpoint: Checkpoint): void {
  const checkpointDir = '.spec2/checkpoints';
  mkdirSync(checkpointDir, { recursive: true });

  const path = `${checkpointDir}/latest.json`;
  writeFileSync(path, JSON.stringify(checkpoint, null, 2), 'utf8');
  console.log(`  💾 Checkpoint saved: ${checkpoint.phase}`);
}

export function loadCheckpoint(): Checkpoint | null {
  const path = '.spec2/checkpoints/latest.json';

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf8');
    const checkpoint = JSON.parse(content);
    console.log(`\n📂 Found checkpoint from ${checkpoint.timestamp}`);
    console.log(`   Last completed phase: ${checkpoint.phase}`);
    return checkpoint;
  } catch (error) {
    console.warn('⚠️  Failed to load checkpoint, starting fresh');
    return null;
  }
}

export function clearCheckpoint(): void {
  const path = '.spec2/checkpoints/latest.json';

  if (existsSync(path)) {
    // Rename to backup instead of delete
    const backupPath = `${path}.backup`;
    const content = readFileSync(path, 'utf8');
    writeFileSync(backupPath, content, 'utf8');
    console.log(`  💾 Checkpoint archived to backup`);
  }
}

export function getCheckpointStatus(): string | null {
  const checkpoint = loadCheckpoint();

  if (!checkpoint) {
    return null;
  }

  const phaseNames: Record<string, string> = {
    wave1: '✓ Wave 1: System Spec',
    wave2: '✓ Wave 2: Subsystem Specs',
    wave3: '✓ Wave 3: Component Specs',
    wave4: '✓ Wave 4: Integration Spec',
    wave5: '✓ Wave 5: Artifacts',
    wave6: '✓ Wave 6: Code Generation',
    complete: '✓ BUILD COMPLETE'
  };

  const completedPhases: string[] = [];
  const phases = ['wave1', 'wave2', 'wave3', 'wave4', 'wave5', 'wave6', 'complete'];
  const currentPhaseIndex = phases.indexOf(checkpoint.phase);

  for (let i = 0; i <= currentPhaseIndex && i < phases.length; i++) {
    completedPhases.push(phaseNames[phases[i]]);
  }

  return `
╔════════════════════════════════════════════════════════╗
║               Spec2 Project Status                     ║
╚════════════════════════════════════════════════════════╝

Last checkpoint: ${checkpoint.timestamp}
Language: ${checkpoint.language}

Completed:
${completedPhases.join('\n')}

${checkpoint.phase === 'complete' ? '\n✅ Build complete! All phases finished.' : `\n⏸️  Ready to resume from: ${phaseNames[phases[currentPhaseIndex + 1]] || 'next phase'}`}
`;
}
