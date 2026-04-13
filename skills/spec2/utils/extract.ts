/**
 * Utilities to extract subsystems/components from specs
 */

export function extractSubsystems(systemSpec: string): string[] {
  // Extract subsystem names from markdown headers
  const subsystemRegex = /###\s+Subsystem:\s+([^\n]+)/g;
  const matches = [...systemSpec.matchAll(subsystemRegex)];
  return matches.map(m => m[1].trim());
}

export function extractComponents(
  subsystemSpecs: Map<string, string>
): Array<{component: string, subsystem: string}> {
  const components: Array<{component: string, subsystem: string}> = [];

  for (const [subsystem, spec] of subsystemSpecs) {
    // Extract component names from markdown headers
    const componentRegex = /###\s+Component:\s+([^\n]+)/g;
    const matches = [...spec.matchAll(componentRegex)];

    for (const match of matches) {
      components.push({
        component: match[1].trim(),
        subsystem
      });
    }
  }

  return components;
}
