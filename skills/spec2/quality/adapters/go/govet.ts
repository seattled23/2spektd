/**
 * go vet adapter — static analysis from the Go toolchain.
 *
 * `go vet` requires a module context (go.mod in cwd or ancestor). We wrap
 * the input in a disposable module via withTempGoModule. Output format is
 * lines of `<file>:<line>:<col>: <message>` on stderr.
 */

import type {
  QualityIssue,
  QualityRunContext,
  QualityToolAdapter,
} from '../../adapter.js';
import { execTool, whichBinary } from '../../subprocess.js';
import { withTempGoModule, nowIso } from './tempmodule.js';

export const goVetAdapter: QualityToolAdapter = {
  id: 'go-vet',
  languages: ['go'],
  toolType: 'lint',
  install: 'go vet ships with the Go toolchain — install Go from https://go.dev/dl',

  async detect(): Promise<boolean> {
    return await whichBinary('go');
  },

  async run(ctx: QualityRunContext): Promise<QualityIssue[]> {
    return await withTempGoModule(
      ctx.code,
      ctx.path,
      async ({ cwd, filePath }) => {
        const { stdout, stderr } = await execTool(
          'go',
          ['vet', './...'],
          { cwd, timeoutMs: ctx.timeoutMs ?? 30_000 },
        );
        // go vet writes diagnostics to stderr. Exit code is non-zero when
        // issues exist but that's the happy path for an issue-reporter.
        const text = stderr.trim() || stdout.trim();
        return parseGoVetOutput(text, filePath);
      },
      ctx.cwd,
    );
  },
};

/**
 * Parse go vet stderr. Format per line:
 *   <file>:<line>:<col>: <message>
 *   <file>:<line>: <message>            (some checks omit the column)
 * Ignores banner lines like:
 *   # package/path
 *   vet: ...: <tool-level error>
 */
export function parseGoVetOutput(text: string, fallbackFile: string): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('go vet:')) continue;
    if (line.startsWith('vet:')) continue;

    const withCol =
      /^(?<file>[^:]+):(?<line>\d+):(?<col>\d+):\s*(?<msg>.+)$/.exec(line);
    if (withCol?.groups) {
      out.push({
        tool: 'go-vet',
        type: 'lint',
        severity: 'warning',
        file: withCol.groups.file || fallbackFile,
        line: parseInt(withCol.groups.line, 10),
        column: parseInt(withCol.groups.col, 10),
        rule: 'govet',
        message: withCol.groups.msg,
        detectedAt: nowIso(),
      });
      continue;
    }

    const noCol = /^(?<file>[^:]+):(?<line>\d+):\s*(?<msg>.+)$/.exec(line);
    if (noCol?.groups) {
      out.push({
        tool: 'go-vet',
        type: 'lint',
        severity: 'warning',
        file: noCol.groups.file || fallbackFile,
        line: parseInt(noCol.groups.line, 10),
        rule: 'govet',
        message: noCol.groups.msg,
        detectedAt: nowIso(),
      });
    }
  }
  return out;
}
