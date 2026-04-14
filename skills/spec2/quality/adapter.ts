/**
 * QualityToolAdapter — subprocess-backed static-analysis integration.
 *
 * Ported interface from CompanyOS2/companyos/services/analysis_registry.py
 * and background/tasks/tech_debt.py. The QualityIssue shape is intentionally
 * byte-compatible with CompanyOS2's normalized dict
 *   {type, severity, file, line, rule, message, detected_at}
 * so a v1.4.0 shared-package extraction (§9.5-P8) can merge these without
 * schema changes.
 *
 * Locked constraints (§9.7):
 *   - Tool-missing is NON-FATAL: detect() returning false → empty issues,
 *     build continues. Final report lists missing tools for the user.
 *   - Every adapter.run() is wrapped in a hard timeout.
 *   - Adapters NEVER mutate user code. Format checkers run in list-only mode.
 *   - Severity mapping mirrors CompanyOS2's conventions; see individual
 *     adapter files for per-tool mapping.
 */

export type QualityIssueType =
  | 'lint'
  | 'security'
  | 'dead_code'
  | 'complexity'
  | 'sast'
  | 'format';

export type QualityIssueSeverity = 'error' | 'warning' | 'info';

export interface QualityIssue {
  /** Tool id that produced this issue — 'golangci-lint', 'ruff', ... */
  tool: string;
  /** Category this issue falls into. */
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  /** File path the issue was reported against (absolute or relative to cwd). */
  file: string;
  /** 1-indexed line number if the tool reported one. */
  line?: number;
  /** 1-indexed column if the tool reported one. */
  column?: number;
  /** Stable rule identifier from the tool (e.g. 'errcheck', 'SA1000'). */
  rule?: string;
  /** Human-readable message from the tool. */
  message: string;
  /** True if the tool reports the issue as auto-fixable. */
  fixable?: boolean;
  /** ISO-8601 timestamp the issue was observed. */
  detectedAt: string;
}

export interface QualityRunContext {
  /** File contents — adapters may write this to a tempfile if needed. */
  code: string;
  /**
   * Filesystem path the code lives at (or would live at, if a tempfile).
   * Adapters that need a project context should use `cwd` instead.
   */
  path: string;
  /** Working directory for the subprocess. Defaults to dirname(path). */
  cwd?: string;
  /** Hard timeout in ms for this single adapter run. */
  timeoutMs?: number;
}

export interface QualityToolAdapter {
  /** Stable id — matches the CompanyOS2 tool id where possible. */
  id: string;
  /** LanguagePack ids this adapter applies to. */
  languages: string[];
  /** Primary categorization used for issue classification. */
  toolType: QualityIssueType;
  /** Returns true if the tool binary is installed and usable. */
  detect(): Promise<boolean>;
  /** Runs the tool against `ctx`, returns normalized issues. */
  run(ctx: QualityRunContext): Promise<QualityIssue[]>;
  /** Install hint for a missing-tool user message — e.g. "go install github.com/..." */
  install?: string;
}

// ---------------------------------------------------------------------------
//  Orchestration — runAdapter and runAll
// ---------------------------------------------------------------------------

export interface QualityRunReport {
  adapter: string;
  installed: boolean;
  timedOut: boolean;
  errored: boolean;
  errorMessage?: string;
  issues: QualityIssue[];
  durationMs: number;
}

export interface QualityBatchReport {
  totalAdapters: number;
  installed: number;
  missing: string[];
  errored: string[];
  timedOut: string[];
  issues: QualityIssue[];
  runs: QualityRunReport[];
  totalDurationMs: number;
}

/**
 * Run a single adapter with timeout + error isolation. Failures never throw —
 * they show up as `errored` in the returned report.
 */
export async function runAdapter(
  adapter: QualityToolAdapter,
  ctx: QualityRunContext,
): Promise<QualityRunReport> {
  const started = Date.now();
  const timeoutMs = ctx.timeoutMs ?? 60_000;

  let installed = false;
  try {
    installed = await adapter.detect();
  } catch (err) {
    return {
      adapter: adapter.id,
      installed: false,
      timedOut: false,
      errored: true,
      errorMessage: `detect() threw: ${err instanceof Error ? err.message : String(err)}`,
      issues: [],
      durationMs: Date.now() - started,
    };
  }

  if (!installed) {
    return {
      adapter: adapter.id,
      installed: false,
      timedOut: false,
      errored: false,
      issues: [],
      durationMs: Date.now() - started,
    };
  }

  try {
    const issues = await withTimeout(adapter.run(ctx), timeoutMs, adapter.id);
    return {
      adapter: adapter.id,
      installed: true,
      timedOut: false,
      errored: false,
      issues,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = msg.startsWith('timeout:');
    return {
      adapter: adapter.id,
      installed: true,
      timedOut,
      errored: !timedOut,
      errorMessage: timedOut ? `run exceeded ${timeoutMs}ms` : msg,
      issues: [],
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Run every adapter sequentially against the same context, aggregating
 * results. Sequential (not parallel) because adapters share the filesystem
 * and spawn subprocesses — avoiding resource contention is worth the
 * latency cost on per-component post-codegen runs.
 */
export async function runAll(
  adapters: QualityToolAdapter[],
  ctx: QualityRunContext,
): Promise<QualityBatchReport> {
  const started = Date.now();
  const runs: QualityRunReport[] = [];
  for (const a of adapters) {
    runs.push(await runAdapter(a, ctx));
  }

  const issues = runs.flatMap(r => r.issues);
  const missing = runs.filter(r => !r.installed).map(r => r.adapter);
  const errored = runs.filter(r => r.errored).map(r => r.adapter);
  const timedOut = runs.filter(r => r.timedOut).map(r => r.adapter);
  const installed = runs.filter(r => r.installed).length;

  return {
    totalAdapters: adapters.length,
    installed,
    missing,
    errored,
    timedOut,
    issues,
    runs,
    totalDurationMs: Date.now() - started,
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
