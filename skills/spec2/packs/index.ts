/**
 * Language Pack registry — §8 of ROADMAP.
 *
 * Each pack is a self-contained manifest binding together:
 *   - Codegen-time guidance (prompt additions for Wave 6 LLM calls).
 *   - Post-generation validation (pack-specific hallucination + hollow-test
 *     detectors) that override the generic built-in dispatchers.
 *   - Quality-tool adapters (§9) run against the generated file.
 *
 * Discovery model: packs self-register at module load. `packs/index.ts`
 * imports each pack's manifest module; those modules call `registerPack()`
 * as a top-level side effect. This keeps the orchestrator's wiring zero —
 * `import './packs/index.js'` once from orchestrate.ts and every registered
 * pack is available via `getPack(id)`.
 *
 * Migration path (ROADMAP §8.0):
 *   v1.3.0 — Go pack registered; Python/TS/JS continue to use the built-in
 *             language dispatch in anti-hallucination.ts / anti-hollow.ts
 *             for backwards compatibility (falls through to legacy when
 *             getPack() returns undefined).
 *   v1.3.1+ — Remaining languages migrate to packs one at a time.
 *   v1.4.0  — Registry becomes canonical; built-in switch branches removed.
 *
 * See ROADMAP.md §8 for the full specification.
 */

import type { HallucinationReport } from '../verification/anti-hallucination.js';
import type { HollowReport } from '../verification/anti-hollow.js';
import type { QualityToolAdapter } from '../quality/adapter.js';

export interface LanguagePack {
  /** Canonical language id — matches the `language` arg of the orchestrator. */
  id: string;
  /** Human-readable display name for logs and reports. */
  displayName: string;
  /**
   * File extensions owned by this pack. The FIRST extension is used as the
   * default for generated files (supplants orchestrate.ts getExtension map).
   */
  extensions: string[];
  /** Regex matching test-file names for this language (e.g. /_test\.go$/). */
  testFilePattern: RegExp;
  /**
   * Language-specific guidance appended to Wave 6 codegen prompts.
   * Markdown-formatted block covering: idioms, test framework, lint rules,
   * error-handling conventions, import style. See ROADMAP §8.4 for content
   * requirements.
   */
  codegenPromptTemplate: string;
  /**
   * Pack-specific hallucination detector. Overrides the built-in switch
   * in anti-hallucination.ts when the pack is registered.
   * Absent → anti-hallucination falls back to legacy dispatch.
   */
  hallucinationDetector?: (code: string) => Promise<HallucinationReport>;
  /**
   * Pack-specific hollow-test detector. Overrides the built-in switch in
   * anti-hollow.ts when the pack is registered.
   * Absent → anti-hollow falls back to legacy dispatch.
   */
  hollowTestDetector?: (code: string) => Promise<HollowReport>;
  /** Quality-tool adapters to run against generated code, in order. */
  qualityTools: QualityToolAdapter[];
}

// ---------------------------------------------------------------------------
//  Registry state (module-local)
// ---------------------------------------------------------------------------

const registry = new Map<string, LanguagePack>();

/**
 * Register a language pack. Idempotent per-id — re-registering the same id
 * replaces the previous entry (useful for hot-reload / test scenarios).
 *
 * Throws if the pack's id is empty, extensions[] is empty, or displayName
 * is empty — these are invariants the rest of the code relies on.
 */
export function registerPack(pack: LanguagePack): void {
  if (!pack.id) throw new Error('LanguagePack.id is required');
  if (!pack.displayName) {
    throw new Error(`LanguagePack[${pack.id}].displayName is required`);
  }
  if (!pack.extensions || pack.extensions.length === 0) {
    throw new Error(`LanguagePack[${pack.id}].extensions must be non-empty`);
  }
  if (!pack.codegenPromptTemplate) {
    throw new Error(`LanguagePack[${pack.id}].codegenPromptTemplate is required`);
  }
  registry.set(pack.id, pack);
}

/**
 * Look up a pack by language id. Returns undefined if no pack is registered
 * for that language — callers should fall back to legacy behavior.
 */
export function getPack(id: string): LanguagePack | undefined {
  return registry.get(id);
}

/** Returns every registered pack (stable iteration order). */
export function listPacks(): LanguagePack[] {
  return Array.from(registry.values());
}

/**
 * Returns the default file extension for a language.
 *   - If a pack is registered: its first extension (without leading dot).
 *   - Otherwise: legacy built-in map fallback. Keeps backward compatibility
 *     until v1.4.0 when packs become canonical.
 */
export function getExtensionForLanguage(language: string): string {
  const pack = registry.get(language);
  if (pack) {
    const ext = pack.extensions[0];
    return ext.startsWith('.') ? ext.slice(1) : ext;
  }
  // Legacy fallback — DO NOT add entries here for new packs, register them.
  const legacy: Record<string, string> = {
    python: 'py',
    typescript: 'ts',
    javascript: 'js',
    go: 'go',
  };
  return legacy[language] ?? 'txt';
}

// ---------------------------------------------------------------------------
//  Pack bootstrap — import pack manifests (they only export values, they do
//  NOT self-register) and then call registerPack() as a module-body statement.
//  This ensures `registry` is initialized before any register call runs
//  (pack modules would otherwise hit a TDZ error on `registry`).
//
//  Adding a new pack: import its manifest here, then append a registerPack line.
// ---------------------------------------------------------------------------

import { goPack } from './go/manifest.js';

registerPack(goPack);
