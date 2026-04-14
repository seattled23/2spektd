/**
 * Subprocess helper for QualityToolAdapter implementations.
 *
 * Design goals:
 *   - Hard timeouts on every external call (§9.6 ship gate).
 *   - Capture stdout + stderr separately (most linters emit JSON on stdout,
 *     errors on stderr).
 *   - Never throw on non-zero exit — linters routinely exit non-zero when
 *     issues are found; that's the happy path for an issue-reporter, not
 *     an error condition. Adapters must interpret exit codes themselves.
 *   - Enforce a generous but bounded maxBuffer so runaway linter output
 *     can't OOM the Node process.
 *
 * Platform: Linux/WSL (spec2's supported environment). `which` is POSIX.
 * If we ever run on Windows, switch `whichBinary` to a PATH-walking check.
 */

import { execFile } from 'child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Process exit code. -1 indicates signal-terminated (including timeout). */
  code: number;
  /** True if the hard timeout fired and the process was killed. */
  timedOut: boolean;
}

export interface ExecOptions {
  cwd?: string;
  /** Hard wall-clock limit in ms. Default 60s. */
  timeoutMs?: number;
  /** Stdin payload; if provided, closes stdin after write. */
  input?: string;
  /** Override max capture (default 16MB). Linters on large files can exceed 1MB. */
  maxBufferBytes?: number;
}

export async function execTool(
  binary: string,
  args: string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxBuffer = opts.maxBufferBytes ?? 16 * 1024 * 1024;

  return await new Promise<ExecResult>(resolve => {
    const child = execFile(
      binary,
      args,
      {
        cwd: opts.cwd,
        timeout: timeoutMs,
        maxBuffer,
        encoding: 'utf8',
      },
      (err, stdout, stderr) => {
        const stdoutStr = typeof stdout === 'string' ? stdout : String(stdout ?? '');
        const stderrStr = typeof stderr === 'string' ? stderr : String(stderr ?? '');

        if (err) {
          // Node sets err.killed = true + err.signal = 'SIGTERM' on timeout.
          const errAny = err as NodeJS.ErrnoException & {
            killed?: boolean;
            signal?: NodeJS.Signals | null;
            code?: number | string;
          };
          const timedOut = errAny.killed === true && errAny.signal === 'SIGTERM';
          const exitCode =
            typeof errAny.code === 'number' ? errAny.code : timedOut ? -1 : 1;
          resolve({ stdout: stdoutStr, stderr: stderrStr, code: exitCode, timedOut });
          return;
        }
        resolve({ stdout: stdoutStr, stderr: stderrStr, code: 0, timedOut: false });
      },
    );

    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input);
    }
  });
}

/**
 * POSIX `which` wrapper. Returns true if the binary is resolvable on PATH.
 * Used by QualityToolAdapter.detect() — fast, no-op on cached results.
 */
export async function whichBinary(binary: string): Promise<boolean> {
  const { code } = await execTool('which', [binary], { timeoutMs: 3000 });
  return code === 0;
}
