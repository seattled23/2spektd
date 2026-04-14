/**
 * Visual Review Package — public API.
 *
 * Generates 1-page markdown summaries + Mermaid diagrams for each
 * wave's spec output. Strictly a human-facing artifact: the orchestrator
 * produces specs, validators pass them, THEN reviews are generated from
 * the validated specs and written to `.spec2/review/`. Nothing here
 * contacts an LLM or influences the pipeline.
 *
 * Call sites (orchestrate.ts):
 *   - After Wave 1 validation passes: generateSystemReview(ctx)
 *   - After Wave 2 validation passes per subsystem: generateSubsystemReview(ctx, name)
 *   - After Wave 3 validation passes per component: generateComponentReview(ctx, name)
 *   - After Wave 4 validation passes: generateIntegrationReview(ctx)
 *
 * Output layout:
 *   .spec2/review/system.md
 *   .spec2/review/subsystems/<name>.md
 *   .spec2/review/components/<name>.md
 *   .spec2/review/integration.md
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  extractSystem,
  extractSubsystem,
  extractComponent,
  extractIntegration,
} from './extract.js';
import {
  renderSystemReview,
  renderSubsystemReview,
  renderComponentReview,
  renderIntegrationReview,
} from './render.js';

/** Minimal context surface needed for review generation. */
export interface ReviewableContext {
  outputDir: string;            // `.spec2/`
  systemSpec?: string;
  subsystemSpecs?: Map<string, string>;
  componentSpecs?: Map<string, string>;
  integrationSpec?: string;
}

export interface ReviewResult {
  path: string;
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════
//  Directory layout
// ═══════════════════════════════════════════════════════════════════════

function reviewRoot(ctx: ReviewableContext): string {
  return path.join(ctx.outputDir, 'review');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilename(name: string): string {
  // Collapse everything that isn't an identifier char, digit, dash, or
  // single dot into underscores. Then collapse any surviving dot-runs
  // (../../foo → ..__..__foo → _foo after full collapse) to kill
  // path-traversal sequences.
  return name
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/_+/g, '_') || 'unnamed';
}

// ═══════════════════════════════════════════════════════════════════════
//  Single-wave generators
// ═══════════════════════════════════════════════════════════════════════

export function generateSystemReview(
  ctx: ReviewableContext,
  systemSpec: string,
  specPath = 'system/system.md',
): ReviewResult {
  const extract = extractSystem(systemSpec);
  const md = renderSystemReview(extract, specPath);
  const dir = reviewRoot(ctx);
  ensureDir(dir);
  const out = path.join(dir, 'system.md');
  fs.writeFileSync(out, md, 'utf8');
  return { path: out, warnings: extract.warnings };
}

export function generateSubsystemReview(
  ctx: ReviewableContext,
  name: string,
  specText: string,
  specPath = '',
): ReviewResult {
  const extract = extractSubsystem(specText);
  const md = renderSubsystemReview(extract, specPath || `subsystems/${name}/subsystem.md`);
  const dir = path.join(reviewRoot(ctx), 'subsystems');
  ensureDir(dir);
  const out = path.join(dir, `${safeFilename(name)}.md`);
  fs.writeFileSync(out, md, 'utf8');
  return { path: out, warnings: extract.warnings };
}

export function generateComponentReview(
  ctx: ReviewableContext,
  name: string,
  specText: string,
  specPath = '',
): ReviewResult {
  const extract = extractComponent(specText);
  const md = renderComponentReview(extract, specPath || `components/${name}/component.md`);
  const dir = path.join(reviewRoot(ctx), 'components');
  ensureDir(dir);
  const out = path.join(dir, `${safeFilename(name)}.md`);
  fs.writeFileSync(out, md, 'utf8');
  return { path: out, warnings: extract.warnings };
}

export function generateIntegrationReview(
  ctx: ReviewableContext,
  integrationSpec: string,
  specPath = 'integration/integration.md',
): ReviewResult {
  const extract = extractIntegration(integrationSpec);
  const md = renderIntegrationReview(extract, specPath);
  const dir = reviewRoot(ctx);
  ensureDir(dir);
  const out = path.join(dir, 'integration.md');
  fs.writeFileSync(out, md, 'utf8');
  return { path: out, warnings: extract.warnings };
}

// ═══════════════════════════════════════════════════════════════════════
//  Convenience: regenerate everything currently in Ctx
// ═══════════════════════════════════════════════════════════════════════

export function generateAllReviews(ctx: ReviewableContext): ReviewResult[] {
  const results: ReviewResult[] = [];
  if (ctx.systemSpec) {
    results.push(generateSystemReview(ctx, ctx.systemSpec));
  }
  if (ctx.subsystemSpecs) {
    for (const [name, text] of ctx.subsystemSpecs.entries()) {
      results.push(generateSubsystemReview(ctx, name, text));
    }
  }
  if (ctx.componentSpecs) {
    for (const [name, text] of ctx.componentSpecs.entries()) {
      results.push(generateComponentReview(ctx, name, text));
    }
  }
  if (ctx.integrationSpec) {
    results.push(generateIntegrationReview(ctx, ctx.integrationSpec));
  }
  return results;
}

// Re-exports for tests
export * from './extract.js';
