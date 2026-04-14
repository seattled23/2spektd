/**
 * Persistence utilities for saving specs and artifacts to disk
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface ProjectPersistence {
  outputDir: string;
  specsDir: string;
  artifactsDir: string;
  srcDir: string;
}

/**
 * Initialize project directory structure
 */
export function initializeProjectStructure(baseDir: string = '.spec2'): ProjectPersistence {
  const outputDir = baseDir;
  const specsDir = `${baseDir}/specs`;
  const artifactsDir = `${baseDir}/artifacts`;
  const srcDir = `${baseDir}/src`;

  // Create directories
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(specsDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });

  return { outputDir, specsDir, artifactsDir, srcDir };
}

/**
 * Save a spec file to disk
 */
export function saveSpec(
  dirs: ProjectPersistence,
  filename: string,
  content: string
): void {
  const path = `${dirs.specsDir}/${filename}`;
  ensureDir(path);
  writeFileSync(path, content, 'utf8');
  console.log(`  💾 Saved: ${path}`);
}

/**
 * Save artifacts for a component
 */
export function saveArtifacts(
  dirs: ProjectPersistence,
  component: string,
  artifacts: {
    correspondence: string;
    completeness: string;
    testRequirements: string;
    architecture: string;
  }
): void {
  const componentDir = `${dirs.artifactsDir}/${component}`;
  mkdirSync(componentDir, { recursive: true });

  // Save each artifact
  const files = {
    'correspondence-matrix.json': artifacts.correspondence,
    'completeness-manifest.json': artifacts.completeness,
    'test-requirements.md': artifacts.testRequirements,
    'architecture-baseline.json': artifacts.architecture,
  };

  for (const [filename, content] of Object.entries(files)) {
    const path = `${componentDir}/${filename}`;
    writeFileSync(path, content, 'utf8');
  }

  console.log(`  💾 Saved artifacts: ${componentDir}/`);
}

/**
 * Save a source code file
 */
export function saveSourceFile(
  dirs: ProjectPersistence,
  filename: string,
  content: string
): void {
  const path = `${dirs.srcDir}/${filename}`;
  ensureDir(path);
  writeFileSync(path, content, 'utf8');
  console.log(`  💾 Saved: ${path}`);
}

/**
 * Generate a project summary file
 */
export function saveProjectSummary(
  dirs: ProjectPersistence,
  data: {
    requirements: string;
    language: string;
    components: string[];
    generatedAt: string;
  }
): void {
  const summary = `# Spec2 Project Summary

**Generated:** ${data.generatedAt}
**Language:** ${data.language}
**Components:** ${data.components.length}

## Requirements
${data.requirements}

## Generated Components
${data.components.map(c => `- ${c}`).join('\n')}

## Project Structure
\`\`\`
.spec2/
├── specs/              # All specification files
│   ├── tier1-system.md
│   ├── tier2-*.md
│   ├── tier3-*.md
│   └── tier4-integration.md
├── artifacts/          # Validation artifacts per component
│   └── [component]/
│       ├── correspondence-matrix.json
│       ├── completeness-manifest.json
│       ├── test-requirements.md
│       └── architecture-baseline.json
└── src/                # Generated source code
    └── *.${getExtension(data.language)}
\`\`\`

## Next Steps
1. Review generated specs in \`specs/\`
2. Examine validation artifacts in \`artifacts/\`
3. Test generated code in \`src/\`
4. Run tests defined in artifact test requirements
5. Deploy with confidence (all specs validated)
`;

  const path = `${dirs.outputDir}/README.md`;
  writeFileSync(path, summary, 'utf8');
  console.log(`\n💾 Project summary: ${path}`);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
}

function getExtension(language: string): string {
  const extensions: Record<string, string> = {
    python: 'py',
    typescript: 'ts',
    javascript: 'js',
    go: 'go',
    java: 'java',
  };
  return extensions[language] || 'txt';
}
