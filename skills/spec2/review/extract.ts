/**
 * Deterministic extractors for Tier 1-4 spec markdown.
 *
 * Given an LLM-generated spec, pull structured data out without calling
 * another LLM. The parsers are lenient — LLM output drifts from templates,
 * so each extractor records warnings for missing sections and returns
 * best-effort data. Callers can inspect warnings to decide whether the
 * spec is review-worthy or whether to regenerate.
 *
 * Agent-isolation note: extractors are orchestrator-local. Their output
 * is written to disk as review markdown ONLY. It is never passed into
 * any LLM prompt. The review package is strictly a human-facing artifact.
 */

// ═══════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════

export interface SystemExtract {
  title: string;
  overview: string;
  subsystems: SubsystemEntry[];
  nfr: Record<string, string>;
  warnings: string[];
}

export interface SubsystemEntry {
  name: string;
  purpose: string;
  responsibilities: string[];
}

export interface SubsystemExtract {
  name: string;
  overview: string;
  components: ComponentEntry[];
  dependencies: DependencyEntry[];
  testStrategy: string;
  warnings: string[];
}

export interface ComponentEntry {
  name: string;
  description: string;
}

export interface DependencyEntry {
  from: string;
  what: string;
  contract: string;
}

export interface ComponentExtract {
  name: string;
  overview: string;
  types: Array<{ name: string; purpose: string }>;
  functions: Array<{ signature: string; purpose: string }>;
  imports: DependencyEntry[];
  exports: string[];
  warnings: string[];
}

export interface IntegrationExtract {
  sharedTypes: string[];
  contracts: Array<{ parties: string; purpose: string; interface: string }>;
  dataFlows: string;
  standards: Record<string, string>;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Return the markdown block under heading `level` whose title matches `pattern`.
 * Block terminates at the next heading of the same or higher level, or EOF.
 */
function sectionOf(text: string, pattern: RegExp, level: number): string {
  const escapedHash = '#'.repeat(level);
  const re = new RegExp(
    `^${escapedHash}\\s+${pattern.source}\\s*$([\\s\\S]*?)(?=^#{1,${level}}\\s|$(?![\\s\\S]))`,
    'im',
  );
  const match = re.exec(text);
  return match ? match[1].trim() : '';
}

/** Split a bulleted list into trimmed line items (drops `- ` prefix). */
function parseBullets(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const m = /^\s*[-*]\s+(.*?)\s*$/.exec(raw);
    if (m && m[1]) out.push(m[1]);
  }
  return out;
}

/** First N prose paragraphs (non-empty, non-heading, non-bullet). */
function firstProse(text: string, maxChars = 300): string {
  const paras = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p && !p.startsWith('#') && !/^[-*]\s/.test(p));
  if (paras.length === 0) return '';
  const joined = paras[0];
  return joined.length <= maxChars ? joined : joined.slice(0, maxChars - 1) + '…';
}

// ═══════════════════════════════════════════════════════════════════════
//  System spec (Tier 1)
// ═══════════════════════════════════════════════════════════════════════

export function extractSystem(spec: string): SystemExtract {
  const warnings: string[] = [];

  const title = (/^#\s+(.+)$/m.exec(spec)?.[1] ?? 'System Specification').trim();

  const overviewBlock = sectionOf(spec, /System Overview/, 2);
  if (!overviewBlock) warnings.push('missing System Overview section');
  const overview = firstProse(overviewBlock, 500);

  const subsystemsBlock = sectionOf(spec, /Subsystems?/, 2);
  if (!subsystemsBlock) warnings.push('missing Subsystems section');

  // Match each "### Subsystem: [Name]" block within the Subsystems section.
  const subsystems: SubsystemEntry[] = [];
  const subRe = /^###\s+Subsystem:\s*(.+?)\s*$([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim;
  let m: RegExpExecArray | null;
  while ((m = subRe.exec(subsystemsBlock)) !== null) {
    const name = m[1].replace(/[\[\]]/g, '').trim();
    const body = m[2];
    const purposeMatch = /\*\*Purpose:\*\*\s*(.+?)(?=\n|$)/i.exec(body);
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';
    const respBlock = /\*\*Key Responsibilities:\*\*([\s\S]*?)(?=^\*\*|$(?![\s\S]))/im.exec(body);
    const responsibilities = respBlock ? parseBullets(respBlock[1]) : [];
    subsystems.push({ name, purpose, responsibilities });
  }
  if (subsystems.length === 0 && subsystemsBlock) {
    warnings.push('Subsystems section present but no "### Subsystem:" entries parsed');
  }

  // NFR — collect bold-keyed bullets under "Non-Functional Requirements"
  const nfrBlock = sectionOf(spec, /Non[- ]?Functional Requirements/, 2);
  const nfr: Record<string, string> = {};
  if (nfrBlock) {
    const nfrRe = /[-*]\s+\*\*(.+?):\*\*\s*(.+?)(?=\n[-*]|\n\n|$(?![\s\S]))/g;
    let n: RegExpExecArray | null;
    while ((n = nfrRe.exec(nfrBlock)) !== null) {
      nfr[n[1].trim()] = n[2].trim();
    }
  }

  return { title, overview, subsystems, nfr, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
//  Subsystem spec (Tier 2)
// ═══════════════════════════════════════════════════════════════════════

export function extractSubsystem(spec: string): SubsystemExtract {
  const warnings: string[] = [];
  const headerMatch = /^#\s+Subsystem:\s*(.+)$/m.exec(spec);
  const name = headerMatch ? headerMatch[1].trim() : 'UnknownSubsystem';
  if (!headerMatch) warnings.push('missing "# Subsystem:" heading');

  const overviewBlock = sectionOf(spec, /Overview/, 2);
  if (!overviewBlock) warnings.push('missing Overview section');
  const overview = firstProse(overviewBlock, 400);

  const componentsBlock = sectionOf(spec, /Components/, 2);
  if (!componentsBlock) warnings.push('missing Components section');

  const components: ComponentEntry[] = [];
  const compRe = /^###\s+Component:\s*(.+?)\s*$([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim;
  let cm: RegExpExecArray | null;
  while ((cm = compRe.exec(componentsBlock)) !== null) {
    const cName = cm[1].replace(/[\[\]]/g, '').trim();
    const description = firstProse(cm[2], 200);
    components.push({ name: cName, description });
  }
  if (components.length === 0 && componentsBlock) {
    warnings.push('Components section present but no "### Component:" entries parsed');
  }

  const depsBlock = sectionOf(spec, /Dependencies/, 2);
  const dependencies = parseDependencyList(depsBlock);

  const testStrategy = sectionOf(spec, /Test Strategy/, 2);

  return {
    name,
    overview,
    components,
    dependencies,
    testStrategy: firstProse(testStrategy, 400),
    warnings,
  };
}

/**
 * Parse "From: [X] | What: [Y] | Contract: [Z]" lines.
 * This format is enforced by the Tier 2 validator (ROADMAP §1.2) — vague
 * dependencies are ERROR-level, so we should find pipe-delimited entries.
 */
function parseDependencyList(block: string): DependencyEntry[] {
  if (!block) return [];
  const out: DependencyEntry[] = [];
  const lines = block.split('\n');
  for (const raw of lines) {
    // Strip bullet prefix if present
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    const m = /^From:\s*\[?(.+?)\]?\s*\|\s*What:\s*\[?(.+?)\]?\s*\|\s*Contract:\s*(.+)$/i.exec(line);
    if (m) {
      out.push({
        from: m[1].trim(),
        what: m[2].trim(),
        contract: m[3].trim(),
      });
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
//  Component spec (Tier 3)
// ═══════════════════════════════════════════════════════════════════════

export function extractComponent(spec: string): ComponentExtract {
  const warnings: string[] = [];
  const headerMatch = /^#\s+Component:\s*(.+)$/m.exec(spec);
  const name = headerMatch ? headerMatch[1].trim() : 'UnknownComponent';
  if (!headerMatch) warnings.push('missing "# Component:" heading');

  const overviewBlock = sectionOf(spec, /Overview/, 2);
  if (!overviewBlock) warnings.push('missing Overview section');
  const overview = firstProse(overviewBlock, 400);

  // Types — "### Type: Name" blocks
  const dataModelBlock = sectionOf(spec, /Data Model/, 2);
  const types: Array<{ name: string; purpose: string }> = [];
  const typeRe = /^###\s+Type:\s*(.+?)\s*$([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim;
  let tm: RegExpExecArray | null;
  while ((tm = typeRe.exec(dataModelBlock)) !== null) {
    const tName = tm[1].replace(/[\[\]]/g, '').trim();
    const purposeMatch = /\*\*Purpose:\*\*\s*(.+?)(?=\n|$)/i.exec(tm[2]);
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';
    types.push({ name: tName, purpose });
  }

  // Functions — "### `signature`" blocks
  const functionsBlock = sectionOf(spec, /Functions/, 2);
  if (!functionsBlock) warnings.push('missing Functions section');
  const functions: Array<{ signature: string; purpose: string }> = [];
  const fnRe = /^###\s+`([^`]+)`\s*$([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim;
  let fm: RegExpExecArray | null;
  while ((fm = fnRe.exec(functionsBlock)) !== null) {
    const signature = fm[1].trim();
    const purposeMatch = /\*\*Purpose:\*\*\s*(.+?)(?=\n|$)/i.exec(fm[2]);
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';
    functions.push({ signature, purpose });
  }

  // Imports / Exports — both live under Dependencies
  const depsBlock = sectionOf(spec, /Dependencies/, 2);
  const importsBlock = /\*\*Imports\b[^*]*\*\*([\s\S]*?)(?=\*\*(Exports|[A-Z])|$)/i.exec(depsBlock);
  const imports = importsBlock ? parseDependencyList(importsBlock[1]) : [];

  const exportsBlock = /\*\*Exports\b[^*]*\*\*([\s\S]*?)$/i.exec(depsBlock);
  const exports = exportsBlock ? parseBullets(exportsBlock[1]) : [];

  return { name, overview, types, functions, imports, exports, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
//  Integration spec (Tier 4)
// ═══════════════════════════════════════════════════════════════════════

export function extractIntegration(spec: string): IntegrationExtract {
  const warnings: string[] = [];

  // Shared Types — captured types or bullets
  const sharedBlock = sectionOf(spec, /Shared Types/, 2);
  const sharedTypes: string[] = [];
  // Look for "### Type: X" first
  const typeRe = /^###\s+Type:\s*(.+?)\s*$/gim;
  let sm: RegExpExecArray | null;
  while ((sm = typeRe.exec(sharedBlock)) !== null) {
    sharedTypes.push(sm[1].trim());
  }
  // Fallback: code-fence interface/type declarations
  if (sharedTypes.length === 0 && sharedBlock) {
    const codeRe = /(?:interface|type)\s+(\w+)/g;
    let cm: RegExpExecArray | null;
    while ((cm = codeRe.exec(sharedBlock)) !== null) {
      sharedTypes.push(cm[1]);
    }
  }

  // Interface Contracts
  const contractsBlock = sectionOf(spec, /Interface Contracts/, 2);
  if (!contractsBlock) warnings.push('missing Interface Contracts section');
  const contracts: Array<{ parties: string; purpose: string; interface: string }> = [];
  const contractRe = /^###\s+Contract:\s*(.+?)\s*$([\s\S]*?)(?=^###\s|$(?![\s\S]))/gim;
  let cr: RegExpExecArray | null;
  while ((cr = contractRe.exec(contractsBlock)) !== null) {
    const parties = cr[1].trim();
    const purposeMatch = /\*\*Purpose:\*\*\s*(.+?)(?=\n|$)/i.exec(cr[2]);
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';
    const ifaceMatch = /\*\*Interface:\*\*([\s\S]*?)(?=\*\*|$)/i.exec(cr[2]);
    const ifaceRaw = ifaceMatch ? parseBullets(ifaceMatch[1]).join('; ') : '';
    contracts.push({ parties, purpose, interface: ifaceRaw });
  }

  const dataFlowsBlock = sectionOf(spec, /Data Flows?/, 2);
  const dataFlows = firstProse(dataFlowsBlock, 500);

  // Cross-Cutting Standards — bold-keyed bullets
  const standardsBlock = sectionOf(spec, /Cross[- ]Cutting Standards?/, 2);
  const standards: Record<string, string> = {};
  if (standardsBlock) {
    const re = /[-*]\s+\*\*(.+?):\*\*\s*(.+?)(?=\n[-*]|\n\n|$(?![\s\S]))/g;
    let n: RegExpExecArray | null;
    while ((n = re.exec(standardsBlock)) !== null) {
      standards[n[1].trim()] = n[2].trim();
    }
  }

  return { sharedTypes, contracts, dataFlows, standards, warnings };
}

/**
 * Parties like "[ComponentA] ↔ [ComponentB]" or "ComponentA ↔ ComponentB".
 * Returns the two ends, or null if the shape doesn't parse.
 */
export function splitContractParties(parties: string): [string, string] | null {
  const m = /^\[?(.+?)\]?\s*(?:↔|<->|-|to|→|<>)\s*\[?(.+?)\]?\s*$/.exec(parties);
  if (!m) return null;
  return [m[1].trim(), m[2].trim()];
}
