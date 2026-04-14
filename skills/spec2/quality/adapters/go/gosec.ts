/**
 * gosec adapter — Go security scanner.
 *
 * Runs `gosec -fmt json ./...` inside a temp module. Output schema:
 *   {
 *     "Issues": [
 *       {
 *         "severity": "LOW" | "MEDIUM" | "HIGH",
 *         "confidence": "LOW" | "MEDIUM" | "HIGH",
 *         "cwe": { "ID": "...", "URL": "..." },
 *         "rule_id": "G101",
 *         "details": "Potential hardcoded credentials",
 *         "file": "/path/to/file.go",
 *         "code": "...",
 *         "line": "12",           // string in gosec's JSON
 *         "column": "8"
 *       }
 *     ],
 *     "Stats": {...},
 *     "GolangVersion": "..."
 *   }
 *
 * Severity mapping (matches CompanyOS2 _map_gosec_severity):
 *   HIGH → error, MEDIUM → warning, LOW → info.
 */

import type {
  QualityIssue,
  QualityIssueSeverity,
  QualityRunContext,
  QualityToolAdapter,
} from '../../adapter.js';
import { execTool, whichBinary } from '../../subprocess.js';
import { withTempGoModule, nowIso } from './tempmodule.js';

export const gosecAdapter: QualityToolAdapter = {
  id: 'gosec',
  languages: ['go'],
  toolType: 'security',
  install: 'go install github.com/securego/gosec/v2/cmd/gosec@latest',

  async detect(): Promise<boolean> {
    return await whichBinary('gosec');
  },

  async run(ctx: QualityRunContext): Promise<QualityIssue[]> {
    return await withTempGoModule(
      ctx.code,
      ctx.path,
      async ({ cwd, filePath }) => {
        // -quiet suppresses non-issue banner on stdout. -fmt json prints the report.
        const { stdout, timedOut } = await execTool(
          'gosec',
          ['-quiet', '-fmt', 'json', './...'],
          { cwd, timeoutMs: ctx.timeoutMs ?? 45_000 },
        );
        if (timedOut) return [];
        const payload = stdout.trim();
        if (!payload) return [];
        return parseGosecJson(payload, filePath);
      },
      ctx.cwd,
    );
  },
};

export function parseGosecJson(
  json: string,
  fallbackFile: string,
): QualityIssue[] {
  let parsed: GosecReport;
  try {
    parsed = JSON.parse(json) as GosecReport;
  } catch {
    return [];
  }
  if (!parsed.Issues) return [];

  return parsed.Issues.map((iss): QualityIssue => {
    const rawSev = (iss.severity ?? '').toUpperCase();
    const severity: QualityIssueSeverity =
      rawSev === 'HIGH' ? 'error' : rawSev === 'MEDIUM' ? 'warning' : 'info';

    // gosec emits line/column as strings; handle range notation "12-14".
    const line = parseFirstInt(iss.line);
    const column = parseFirstInt(iss.column);

    return {
      tool: 'gosec',
      type: 'security',
      severity,
      file: iss.file ?? fallbackFile,
      line,
      column,
      rule: iss.rule_id,
      message: iss.details ?? '(no message)',
      detectedAt: nowIso(),
    };
  });
}

function parseFirstInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /^\d+/.exec(s);
  return m ? parseInt(m[0], 10) : undefined;
}

interface GosecReport {
  Issues?: Array<{
    severity?: string;
    confidence?: string;
    rule_id?: string;
    details?: string;
    file?: string;
    line?: string;
    column?: string;
    cwe?: { ID?: string; URL?: string };
  }>;
}
