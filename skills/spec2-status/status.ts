/**
 * spec2-status - Display current project status
 */

import { readFileSync, existsSync } from 'fs';

interface Checkpoint {
  phase: string;
  timestamp: string;
  language: string;
}

export async function execute(): Promise<void> {
  const path = '.spec2/checkpoints/latest.json';

  if (!existsSync(path)) {
    console.log(`
╔════════════════════════════════════════════════════════╗
║               Spec2 Project Status                     ║
╚════════════════════════════════════════════════════════╝

No active Spec2 project found in current directory.

To start a new project:
  /spec2-new "your requirements here"

To check status of a different directory:
  cd path/to/project && /spec2-status
`);
    return;
  }

  try {
    const content = readFileSync(path, 'utf8');
    const checkpoint: Checkpoint = JSON.parse(content);

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

    console.log(`
╔════════════════════════════════════════════════════════╗
║               Spec2 Project Status                     ║
╚════════════════════════════════════════════════════════╝

Last checkpoint: ${checkpoint.timestamp}
Language: ${checkpoint.language}

Completed:
${completedPhases.join('\n')}

${checkpoint.phase === 'complete' ? '\n✅ Build complete! All phases finished.' : `\n⏸️  Ready to resume from: ${phaseNames[phases[currentPhaseIndex + 1]] || 'next phase'}`}
`);
  } catch (error) {
    console.error('Error reading checkpoint:', error);
  }
}
