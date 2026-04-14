/**
 * gofmt adapter — format drift detection.
 *
 * Runs `gofmt -l <file>`. Output is a single line per file that needs
 * reformatting, empty otherwise. Spec2 NEVER auto-formats (§9.7).
 * Unlike go vet / golangci-lint / gosec, gofmt works on a single file
 * without a module — no temp-module setup needed.
 */

import type {
  QualityIssue,
  QualityRunContext,
  QualityToolAdapter,
} from '../../adapter.js';
import { execTool, whichBinary } from '../../subprocess.js';
import { nowIso } from './tempmodule.js';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';

export const gofmtAdapter: QualityToolAdapter = {
  id: 'gofmt',
  languages: ['go'],
  toolType: 'format',
  install: 'gofmt ships with the Go toolchain — install Go from https://go.dev/dl',

  async detect(): Promise<boolean> {
    return await whichBinary('gofmt');
  },

  async run(ctx: QualityRunContext): Promise<QualityIssue[]> {
    // If ctx.path exists on disk, point gofmt at it directly. Otherwise
    // materialise a tempfile just for this check — no module needed.
    let filePath = ctx.path;
    let tempDir: string | undefined;
    if (!existsSync(filePath)) {
      tempDir = await mkdtemp(join(tmpdir(), 'spec2-gofmt-'));
      filePath = join(tempDir, basename(ctx.path) || 'input.go');
      await writeFile(filePath, ctx.code, 'utf8');
    }
    try {
      const { stdout, stderr, code } = await execTool(
        'gofmt',
        ['-l', filePath],
        { timeoutMs: ctx.timeoutMs ?? 30_000, cwd: ctx.cwd ?? dirname(filePath) },
      );
      // Syntactic errors from gofmt land on stderr with exit code 2.
      if (code !== 0 && stderr.trim()) {
        return parseGofmtErrors(stderr, filePath);
      }
      return parseGofmtListing(stdout, filePath);
    } finally {
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }
  },
};

function parseGofmtListing(stdout: string, filePath: string): QualityIssue[] {
  const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  return [
    {
      tool: 'gofmt',
      type: 'format',
      severity: 'warning',
      file: filePath,
      rule: 'gofmt-drift',
      message: 'File is not gofmt-formatted — run `gofmt -w` to fix',
      fixable: true,
      detectedAt: nowIso(),
    },
  ];
}

// gofmt stderr format on syntax errors:
//   <file>:<line>:<col>: <message>
function parseGofmtErrors(stderr: string, filePath: string): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const line of stderr.split('\n')) {
    const m = /^(?<file>[^:]+):(?<line>\d+):(?<col>\d+):\s*(?<msg>.+)$/.exec(
      line.trim(),
    );
    if (!m || !m.groups) continue;
    out.push({
      tool: 'gofmt',
      type: 'format',
      severity: 'error',
      file: m.groups.file || filePath,
      line: parseInt(m.groups.line, 10),
      column: parseInt(m.groups.col, 10),
      rule: 'gofmt-parse-error',
      message: m.groups.msg,
      detectedAt: nowIso(),
    });
  }
  return out;
}

export const __internal = { parseGofmtListing, parseGofmtErrors };
