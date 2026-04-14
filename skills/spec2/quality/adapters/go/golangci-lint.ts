/**
 * golangci-lint adapter — meta-linter bundling ~50 Go linters.
 *
 * Runs via `golangci-lint run --out-format json ./...` inside a temp module.
 * Output schema (simplified):
 *   {
 *     "Issues": [
 *       {
 *         "FromLinter": "errcheck",
 *         "Text": "...",
 *         "Severity": "error" | "warning" | "" ,
 *         "Pos": { "Filename": "...", "Line": N, "Column": N },
 *         "Replacement": { "NeedOnlyDelete": false, "Inline": {...} } | null
 *       }
 *     ],
 *     "Report": { "Error": "..." } | null
 *   }
 *
 * Severity mapping (matches CompanyOS2 _run_golangci_lint convention):
 *   Pos.Column 0 and no Severity → 'warning'
 *   Severity 'error' / linter in HARD_ERROR_LINTERS → 'error'
 *   otherwise → 'warning'
 */

import type {
  QualityIssue,
  QualityIssueSeverity,
  QualityRunContext,
  QualityToolAdapter,
} from '../../adapter.js';
import { execTool, whichBinary } from '../../subprocess.js';
import { withTempGoModule, nowIso } from './tempmodule.js';

// Linters whose findings we treat as errors rather than warnings.
const HARD_ERROR_LINTERS = new Set([
  'errcheck',       // unchecked errors — almost always a real bug
  'staticcheck',    // high-precision; staticcheck findings are rarely noise
  'govet',          // overlaps go vet; same severity
  'typecheck',      // compilation-adjacent errors
  'gosec',          // security-sensitive
]);

export const golangciLintAdapter: QualityToolAdapter = {
  id: 'golangci-lint',
  languages: ['go'],
  toolType: 'lint',
  install: 'curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin',

  async detect(): Promise<boolean> {
    return await whichBinary('golangci-lint');
  },

  async run(ctx: QualityRunContext): Promise<QualityIssue[]> {
    return await withTempGoModule(
      ctx.code,
      ctx.path,
      async ({ cwd, filePath }) => {
        const { stdout, stderr, code, timedOut } = await execTool(
          'golangci-lint',
          ['run', '--out-format', 'json', '--timeout', '45s', './...'],
          { cwd, timeoutMs: ctx.timeoutMs ?? 60_000 },
        );
        if (timedOut) return [];
        // golangci-lint exits non-zero when issues found; that's expected.
        // Treat stdout as the JSON payload; if empty, try stderr.
        const payload = stdout.trim() || stderr.trim();
        if (!payload) return [];
        // Suppress fatal-config-error lines that precede the JSON envelope.
        const jsonStart = payload.indexOf('{');
        if (jsonStart < 0) return [];
        return parseGolangciLintJson(payload.slice(jsonStart), filePath);
      },
      ctx.cwd,
    );
  },
};

export function parseGolangciLintJson(
  json: string,
  fallbackFile: string,
): QualityIssue[] {
  let parsed: GolangciLintReport;
  try {
    parsed = JSON.parse(json) as GolangciLintReport;
  } catch {
    return [];
  }
  if (!parsed.Issues) return [];

  return parsed.Issues.map((iss): QualityIssue => {
    const rawSeverity = (iss.Severity ?? '').toLowerCase();
    const linter = iss.FromLinter ?? '';
    const severity: QualityIssueSeverity =
      rawSeverity === 'error' || HARD_ERROR_LINTERS.has(linter)
        ? 'error'
        : rawSeverity === 'info'
          ? 'info'
          : 'warning';
    return {
      tool: 'golangci-lint',
      type: 'lint',
      severity,
      file: iss.Pos?.Filename ?? fallbackFile,
      line: iss.Pos?.Line,
      column: iss.Pos?.Column,
      rule: linter || undefined,
      message: iss.Text ?? '(no message)',
      fixable: iss.Replacement != null,
      detectedAt: nowIso(),
    };
  });
}

interface GolangciLintReport {
  Issues?: Array<{
    FromLinter?: string;
    Text?: string;
    Severity?: string;
    Pos?: { Filename?: string; Line?: number; Column?: number };
    Replacement?: unknown;
  }>;
}
