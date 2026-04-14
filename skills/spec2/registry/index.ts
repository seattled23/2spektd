/**
 * Integration Registry — SQLite-backed metadata index for component public surfaces.
 *
 * Purpose: Tier 4 (integration spec generation) can query only the public surface
 * of each component instead of loading full ~12-page component specs verbatim.
 * At N components × ~12 pages each, verbatim loading easily exceeds 15K tokens;
 * the registry summary targets <2K chars for 5 components.
 *
 * Agent isolation contract (ROADMAP §1 invariant):
 * - The registry is orchestrator-local state — never shown to an LLM directly.
 * - Only `getRegistrySummary()` output enters a prompt, and it is a curated
 *   PUBLIC-SURFACE view: function signatures + types + cross-component links only.
 * - Internal metadata (parse_warnings, ingested_at, row ids) never reaches an agent.
 *
 * Storage: `.spec2/registry.db` alongside `.spec2/checkpoints/`.
 */

import Database, { type Database as DB } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface FunctionRecord {
  name: string;
  signature: string;
  purpose: string;
  preconditions: string;
  postconditions: string;
  errorCases: string;
}

export interface TypeRecord {
  name: string;
  definition: string;
  purpose: string;
}

export interface ImportRecord {
  fromComponent: string;
  symbol: string;
}

export interface ComponentSummary {
  name: string;
  subsystem: string;
  functions: FunctionRecord[];
  types: TypeRecord[];
  exports: string[];
  imports: ImportRecord[];
}

export interface RegistrySummary {
  componentCount: number;
  components: Array<{
    name: string;
    subsystem: string;
    publicFunctions: string[];   // compact: "name(sig) → return — purpose"
    publicTypes: string[];       // compact: "TypeName: purpose"
    exports: string[];
    importedFrom: string[];      // compact: "SourceComp :: symbol"
  }>;
  sharedTypes: Array<{
    name: string;
    usedBy: string[];
    purpose: string;
  }>;
  crossComponentLinks: Array<{
    source: string;
    target: string;
    symbol: string;
  }>;
}

export interface ParseResult {
  functions: FunctionRecord[];
  types: TypeRecord[];
  exports: string[];
  imports: ImportRecord[];
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════
//  SCHEMA
// ═══════════════════════════════════════════════════════════════════════

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS components (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  subsystem    TEXT NOT NULL DEFAULT '',
  spec_path    TEXT NOT NULL DEFAULT '',
  ingested_at  TEXT NOT NULL,
  parse_warnings TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS functions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id   INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  signature      TEXT NOT NULL DEFAULT '',
  purpose        TEXT NOT NULL DEFAULT '',
  preconditions  TEXT NOT NULL DEFAULT '',
  postconditions TEXT NOT NULL DEFAULT '',
  error_cases    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  definition   TEXT NOT NULL DEFAULT '',
  purpose      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  component_id   INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  from_component TEXT NOT NULL,
  symbol         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_functions_component ON functions(component_id);
CREATE INDEX IF NOT EXISTS idx_types_component     ON types(component_id);
CREATE INDEX IF NOT EXISTS idx_exports_component   ON exports(component_id);
CREATE INDEX IF NOT EXISTS idx_imports_component   ON imports(component_id);
CREATE INDEX IF NOT EXISTS idx_imports_from        ON imports(from_component);
`;

// ═══════════════════════════════════════════════════════════════════════
//  REGISTRY CLASS
// ═══════════════════════════════════════════════════════════════════════

export class IntegrationRegistry {
  private db: DB;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    // Apply schema idempotently
    this.db.exec(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  /**
   * Parse a Tier 3 component spec (markdown) and insert/replace all rows.
   * Lenient: missing sections produce warnings but do not throw.
   * Idempotent: existing component rows are deleted and re-inserted.
   */
  ingestComponent(name: string, subsystem: string, specText: string, specPath: string = ''): void {
    const parsed = parseComponentSpec(specText);

    const now = new Date().toISOString();
    const warningsJson = parsed.warnings.length > 0
      ? JSON.stringify(parsed.warnings)
      : '';

    if (parsed.warnings.length > 0) {
      console.warn(`[registry] Parse warnings for ${name}: ${parsed.warnings.join('; ')}`);
    }

    // Use a transaction so the delete+insert is atomic
    const ingest = this.db.transaction(() => {
      // Delete any existing rows (idempotent re-ingest)
      const existing = this.db.prepare(
        'SELECT id FROM components WHERE name = ?'
      ).get(name) as { id: number } | undefined;

      if (existing) {
        this.db.prepare('DELETE FROM components WHERE id = ?').run(existing.id);
      }

      const result = this.db.prepare(`
        INSERT INTO components (name, subsystem, spec_path, ingested_at, parse_warnings)
        VALUES (?, ?, ?, ?, ?)
      `).run(name, subsystem, specPath, now, warningsJson);

      const componentId = result.lastInsertRowid as number;

      for (const fn of parsed.functions) {
        this.db.prepare(`
          INSERT INTO functions (component_id, name, signature, purpose, preconditions, postconditions, error_cases)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(componentId, fn.name, fn.signature, fn.purpose, fn.preconditions, fn.postconditions, fn.errorCases);
      }

      for (const type of parsed.types) {
        this.db.prepare(`
          INSERT INTO types (component_id, name, definition, purpose)
          VALUES (?, ?, ?, ?)
        `).run(componentId, type.name, type.definition, type.purpose);
      }

      for (const symbol of parsed.exports) {
        this.db.prepare(`
          INSERT INTO exports (component_id, symbol) VALUES (?, ?)
        `).run(componentId, symbol);
      }

      for (const imp of parsed.imports) {
        this.db.prepare(`
          INSERT INTO imports (component_id, from_component, symbol)
          VALUES (?, ?, ?)
        `).run(componentId, imp.fromComponent, imp.symbol);
      }
    });

    ingest();
  }

  /**
   * Compact list of all public function signatures across all components.
   * Format: "ComponentName.functionName(params) → return — purpose"
   */
  getAllFunctionSignatures(): string[] {
    const rows = this.db.prepare(`
      SELECT c.name AS component, f.name AS fname, f.signature, f.purpose
      FROM functions f
      JOIN components c ON c.id = f.component_id
      ORDER BY c.name, f.name
    `).all() as Array<{ component: string; fname: string; signature: string; purpose: string }>;

    return rows.map(r => {
      const sig = r.signature.trim() || r.fname;
      const purpose = r.purpose ? ` — ${r.purpose.slice(0, 80)}` : '';
      return `${r.component}.${sig}${purpose}`;
    });
  }

  /**
   * Types that appear in ≥2 distinct components (shared types).
   */
  getSharedTypes(): Array<{ name: string; usedBy: string[]; definition: string; purpose: string }> {
    // Find type names appearing in ≥2 components
    const rows = this.db.prepare(`
      SELECT t.name, GROUP_CONCAT(c.name, '|') AS components, t.definition, t.purpose
      FROM types t
      JOIN components c ON c.id = t.component_id
      GROUP BY t.name
      HAVING COUNT(DISTINCT c.id) >= 2
      ORDER BY t.name
    `).all() as Array<{ name: string; components: string; definition: string; purpose: string }>;

    return rows.map(r => ({
      name: r.name,
      usedBy: [...new Set(r.components.split('|'))],
      definition: r.definition,
      purpose: r.purpose,
    }));
  }

  /**
   * All cross-component dependency edges.
   * Returns: (sourceComponent → targetComponent :: symbol)
   */
  getCrossComponentLinks(): Array<{ source: string; target: string; symbol: string }> {
    const componentNames = new Set(
      (this.db.prepare('SELECT name FROM components').all() as Array<{ name: string }>)
        .map(r => r.name)
    );

    const rows = this.db.prepare(`
      SELECT c.name AS source, i.from_component AS target, i.symbol
      FROM imports i
      JOIN components c ON c.id = i.component_id
      ORDER BY source, target, i.symbol
    `).all() as Array<{ source: string; target: string; symbol: string }>;

    // Only return edges where target is a known component in the registry
    return rows.filter(r => componentNames.has(r.target));
  }

  /**
   * Compact JSON summary suitable as Tier 4 prompt context.
   * This is the ONLY output that enters an LLM prompt — it is a curated
   * public-surface view. Internal metadata is excluded.
   */
  getRegistrySummary(): RegistrySummary {
    const components = this.db.prepare(`
      SELECT id, name, subsystem FROM components ORDER BY name
    `).all() as Array<{ id: number; name: string; subsystem: string }>;

    const sharedTypes = this.getSharedTypes();
    const crossLinks = this.getCrossComponentLinks();

    const componentSummaries = components.map(comp => {
      const fns = this.db.prepare(`
        SELECT name, signature, purpose FROM functions WHERE component_id = ? ORDER BY name
      `).all(comp.id) as Array<{ name: string; signature: string; purpose: string }>;

      const types = this.db.prepare(`
        SELECT name, purpose FROM types WHERE component_id = ? ORDER BY name
      `).all(comp.id) as Array<{ name: string; purpose: string }>;

      const exports = this.db.prepare(`
        SELECT symbol FROM exports WHERE component_id = ? ORDER BY symbol
      `).all(comp.id) as Array<{ symbol: string }>;

      const imports = this.db.prepare(`
        SELECT from_component, symbol FROM imports WHERE component_id = ? ORDER BY from_component, symbol
      `).all(comp.id) as Array<{ from_component: string; symbol: string }>;

      const publicFunctions = fns.map(f => {
        const sig = f.signature.trim() || f.name;
        const purpose = f.purpose ? ` — ${truncate(f.purpose, 60)}` : '';
        return `${sig}${purpose}`;
      });

      const publicTypes = types.map(t => {
        const purpose = t.purpose ? `: ${truncate(t.purpose, 60)}` : '';
        return `${t.name}${purpose}`;
      });

      const importedFrom = imports.map(i => `${i.from_component} :: ${i.symbol}`);

      return {
        name: comp.name,
        subsystem: comp.subsystem,
        publicFunctions,
        publicTypes,
        exports: exports.map(e => e.symbol),
        importedFrom,
      };
    });

    return {
      componentCount: components.length,
      components: componentSummaries,
      sharedTypes: sharedTypes.map(t => ({
        name: t.name,
        usedBy: t.usedBy,
        purpose: truncate(t.purpose, 80),
      })),
      crossComponentLinks: crossLinks,
    };
  }

  /**
   * Return all component records for inspection / rebuild.
   */
  listComponents(): Array<{ name: string; subsystem: string; specPath: string; parseWarnings: string[] }> {
    const rows = this.db.prepare(
      'SELECT name, subsystem, spec_path, parse_warnings FROM components ORDER BY name'
    ).all() as Array<{ name: string; subsystem: string; spec_path: string; parse_warnings: string }>;

    return rows.map(r => ({
      name: r.name,
      subsystem: r.subsystem,
      specPath: r.spec_path,
      parseWarnings: r.parse_warnings ? JSON.parse(r.parse_warnings) : [],
    }));
  }

  /** Number of ingested components. */
  componentCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM components').get() as { n: number };
    return row.n;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  MODULE-LEVEL FACTORY / CONVENIENCE API
//  (matches the function-based API requested in the spec)
// ═══════════════════════════════════════════════════════════════════════

let _registry: IntegrationRegistry | null = null;

/**
 * Initialize (or re-initialize) the registry at the given db path.
 * Idempotent: calling twice with the same path is safe.
 */
export function initRegistry(dbPath: string): IntegrationRegistry {
  if (_registry) {
    _registry.close();
    _registry = null;
  }
  _registry = new IntegrationRegistry(dbPath);
  return _registry;
}

/**
 * Get the current registry instance. Throws if not initialized.
 */
export function getRegistry(): IntegrationRegistry {
  if (!_registry) {
    throw new Error('Registry not initialized. Call initRegistry(dbPath) first.');
  }
  return _registry;
}

/**
 * Parse a Tier 3 component spec and insert into the active registry.
 */
export function ingestComponent(name: string, subsystem: string, specText: string, specPath: string = ''): void {
  getRegistry().ingestComponent(name, subsystem, specText, specPath);
}

export function getAllFunctionSignatures(): string[] {
  return getRegistry().getAllFunctionSignatures();
}

export function getSharedTypes(): Array<{ name: string; usedBy: string[]; definition: string; purpose: string }> {
  return getRegistry().getSharedTypes();
}

export function getCrossComponentLinks(): Array<{ source: string; target: string; symbol: string }> {
  return getRegistry().getCrossComponentLinks();
}

export function getRegistrySummary(): RegistrySummary {
  return getRegistry().getRegistrySummary();
}

// ═══════════════════════════════════════════════════════════════════════
//  PARSER — lenient regex-based extraction of Tier 3 spec markdown
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse a Tier 3 markdown component spec.
 *
 * The Tier 3 template uses:
 *   ### Function: [name]  OR  ### `signature`
 *   **Purpose:** ...
 *   **@pre:** ...  OR  **Preconditions:** ...
 *   **@post:** ... OR  **Postconditions:** ...
 *   **@error:** ... OR  **Errors:** ...
 *
 *   ## Data Model / ## Data Structures
 *   ### Type: [name]  OR  ``` blocks followed by **Purpose:** ...
 *
 *   ## Dependencies
 *   **Imports (what this component needs):**
 *   - From: [component] | What: [symbol] | Contract: ...
 *   **Exports (what this component provides):**
 *   - [symbol description]
 *
 * The parser is intentionally lenient: it captures what it can and
 * appends a warning for each section it could not parse.
 */
export function parseComponentSpec(specText: string): ParseResult {
  const warnings: string[] = [];
  const functions: FunctionRecord[] = [];
  const types: TypeRecord[] = [];
  const exports: string[] = [];
  const imports: ImportRecord[] = [];

  // ── Functions ──────────────────────────────────────────────────────────
  // Match "### Function: name" OR "### `signature(...)` → Return"
  // Capture the block until the next ### or ##
  // Match "### Function: name" OR "### `signature(...)` → Return"
  // Explicitly exclude "### Type:" headings which belong to the type parser.
  const fnHeaderRe = /^###\s+(?:Function:\s+)?(`[^`]+`|[\w$]+)[^\n]*/gm;
  let fnMatch: RegExpExecArray | null;

  while ((fnMatch = fnHeaderRe.exec(specText)) !== null) {
    const headerLine = fnMatch[0];

    // Skip "### Type: ..." headings — handled by the type parser
    if (/^###\s+Type:\s+/i.test(headerLine)) continue;

    const blockStart = fnMatch.index + headerLine.length;

    // Find end of this function block (next ### or ## heading)
    const nextHeadingRe = /^#{2,3}\s/gm;
    nextHeadingRe.lastIndex = blockStart;
    const nextHeading = nextHeadingRe.exec(specText);
    const blockEnd = nextHeading ? nextHeading.index : specText.length;
    const block = specText.slice(blockStart, blockEnd);

    // Extract the function name from header
    // Priority 1: backtick signature "`funcName(...)` → Return"
    const backtickContent = headerLine.match(/`([^`]+)`/);
    let funcName = '';
    if (backtickContent) {
      // Strip parameters: "login(credentials: UserCredentials) → AuthToken" → "login"
      funcName = backtickContent[1].split('(')[0].trim();
    }
    if (!funcName) {
      // Priority 2: "### Function: name"
      const plainName = headerLine.match(/###\s+Function:\s+(\w[\w$]*)/);
      funcName = plainName ? plainName[1] : headerLine.replace(/^###\s+/, '').trim();
    }

    // Skip section headings that are not functions (e.g. "### Overview")
    if (/^(overview|data model|data structures|state|error handling|dependencies|acceptance criteria|test requirements|type)/i.test(funcName)) {
      continue;
    }

    // Signature: use the header line content (strip leading ### and optional "Function:")
    const signature = headerLine.replace(/^###\s+(?:Function:\s+)?/, '').trim();

    const purpose = extractField(block, ['Purpose', 'Description']) || '';
    const preconditions = extractField(block, ['@pre', 'Preconditions', 'Pre']) || '';
    const postconditions = extractField(block, ['@post', 'Postconditions', 'Post']) || '';
    const errorCases = extractField(block, ['@error', 'Errors', 'Error']) || '';

    functions.push({ name: funcName, signature, purpose, preconditions, postconditions, errorCases });
  }

  if (functions.length === 0) {
    warnings.push('No function blocks found (expected ### Function: or ### `sig`)');
  }

  // ── Types ─────────────────────────────────────────────────────────────
  // Section: ## Data Model / ## Data Structures / ## Types
  const dataSection = extractSection(specText, ['Data Model', 'Data Structures', 'Types']);
  if (dataSection) {
    // Match "### Type: name" or "### TypeName"
    const typeHeaderRe = /^###\s+(?:Type:\s+)?(\w[\w$]*)[^\n]*/gm;
    let typeMatch: RegExpExecArray | null;

    while ((typeMatch = typeHeaderRe.exec(dataSection)) !== null) {
      const typeName = (typeMatch[1] || '').trim();
      if (!typeName || /^(overview|state|error)/i.test(typeName)) continue;

      const tBlockStart = typeMatch.index + typeMatch[0].length;
      const nextRe = /^#{2,3}\s/gm;
      nextRe.lastIndex = tBlockStart;
      const nextH = nextRe.exec(dataSection);
      const tBlock = dataSection.slice(tBlockStart, nextH ? nextH.index : dataSection.length);

      // Extract code block as definition
      const codeMatch = tBlock.match(/```[^\n]*\n([\s\S]*?)```/);
      const definition = codeMatch ? codeMatch[1].trim() : '';
      const purpose = extractField(tBlock, ['Purpose']) || '';

      types.push({ name: typeName, definition, purpose });
    }

    if (types.length === 0) {
      // Fallback: grab any ``` blocks and treat them as type definitions
      const codeBlockRe = /```[^\n]*\n([\s\S]*?)```/g;
      let cbMatch: RegExpExecArray | null;
      while ((cbMatch = codeBlockRe.exec(dataSection)) !== null) {
        const definition = cbMatch[1].trim();
        if (definition.length > 10) {
          types.push({ name: 'AnonymousType', definition, purpose: '' });
        }
      }
    }
  } else {
    warnings.push('No Data Model/Data Structures section found');
  }

  // ── Dependencies (exports + imports) ──────────────────────────────────
  const depsSection = extractSection(specText, ['Dependencies']);
  if (depsSection) {
    // Exports block
    const exportsMatch = depsSection.match(/\*\*Exports[^*]*\*\*[:\s]*([\s\S]*?)(?:\*\*|$)/);
    if (exportsMatch) {
      const exportLines = exportsMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of exportLines) {
        const cleaned = line.replace(/^-\s*/, '').trim();
        if (cleaned) exports.push(cleaned);
      }
    }

    // Imports block — two patterns:
    // Pattern 1 (tier3 template): "- From: [comp] | What: [sym] | Contract: ..."
    // Pattern 2 (subsystem deps): "- [SubsystemA] :: [function/type] — [reason]"
    const importBlockMatch = depsSection.match(/\*\*Imports[^*]*\*\*[:\s]*([\s\S]*?)(?:\*\*(?:Exports|Provides)|$)/);
    if (importBlockMatch) {
      const importLines = importBlockMatch[1].split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of importLines) {
        // Pattern 1
        const p1 = line.match(/From:\s*\[?([^\]|]+)\]?\s*\|\s*What:\s*\[?([^\]|]+)\]?/i);
        if (p1) {
          imports.push({ fromComponent: p1[1].trim(), symbol: p1[2].trim() });
          continue;
        }
        // Pattern 2
        const p2 = line.match(/\[?([^\]::]+)\]?\s*::\s*([^—]+)/);
        if (p2) {
          imports.push({ fromComponent: p2[1].trim(), symbol: p2[2].trim() });
        }
      }
    }
  } else {
    warnings.push('No Dependencies section found');
  }

  return { functions, types, exports, imports, warnings };
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract a named field from a markdown block.
 * Matches: **FieldName:** value (single line) or **FieldName:** \nvalue
 */
function extractField(block: string, fieldNames: string[]): string {
  for (const name of fieldNames) {
    // Inline: **Purpose:** text
    const inline = block.match(new RegExp(`\\*\\*${name}[:\\s]*\\*\\*\\s*([^\\n]+)`, 'i'));
    if (inline && inline[1].trim()) return inline[1].trim();

    // Standalone: **@pre:**\n  text
    const multiLine = block.match(new RegExp(`\\*\\*${name}[:\\s]*\\*\\*\\s*\\n([^\\n*]+)`, 'i'));
    if (multiLine && multiLine[1].trim()) return multiLine[1].trim();
  }
  return '';
}

/**
 * Extract a top-level section (## Heading) from markdown text.
 * Returns the content after the heading up to the next ## heading.
 */
function extractSection(text: string, headingNames: string[]): string | null {
  for (const name of headingNames) {
    const re = new RegExp(`^##\\s+${name}[^\\n]*\\n`, 'im');
    const match = re.exec(text);
    if (!match) continue;

    const start = match.index + match[0].length;
    const nextSection = /^##\s/im;
    // Search from start
    const sub = text.slice(start);
    const nextMatch = nextSection.exec(sub);
    return nextMatch ? sub.slice(0, nextMatch.index) : sub;
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
