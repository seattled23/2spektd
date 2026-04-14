/**
 * Job tracker for long-running orchestrator invocations.
 *
 * Both the MCP server and HTTP API import this module. A build or resume
 * request creates a Job, spawns the orchestrator in a background promise,
 * captures its console output into the job's log buffer, and returns the
 * job ID immediately. Clients poll getJob(id) for progress.
 *
 * Concurrency model
 * -----------------
 * The orchestrator code uses `console.log/error/warn` directly. To route
 * those writes into the correct job's log buffer *without* refactoring the
 * orchestrator (hundreds of call sites), we install a single process-wide
 * console patch on first use. The patched functions look up the current
 * job via an `AsyncLocalStorage` store. `runJobInBackground` wraps the
 * orchestrator call in `jobContext.run({ job }, () => fn())`, so every
 * async call made inside `fn()` — promises, setTimeout, awaited calls —
 * inherits that job's context.
 *
 * Concurrent jobs each get their own ALS store, so console writes never
 * cross between jobs. Console calls made OUTSIDE any job context (e.g.,
 * server startup logs) fall through to the original implementations
 * unchanged.
 *
 * State lives in-process (single Node process per transport server).
 * Checkpoint persistence (spec2 state on disk) is separate — see
 * utils/checkpoint.ts. Jobs are invocation metadata; checkpoints are
 * build state.
 */

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type JobType = 'build' | 'resume';

export interface JobParams {
  requirements?: string;
  language?: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  params: JobParams;
  phase: string;           // mirrors checkpoint.phase when known
  progress: string;         // human-readable: "Wave 3: generating component X"
  logs: string[];           // captured stdout lines (chronological)
  startedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, Job>();
const MAX_LOG_LINES_PER_JOB = 10_000;

/**
 * Where to mirror captured console output.
 *
 *   'stdout'  — default. Preserves original behavior: orchestrator logs are
 *               visible in the process stdout stream AND captured in the job
 *               log buffer. Correct for the HTTP API and direct CLI runs.
 *   'stderr'  — for stdio-transport MCP servers. stdout is reserved for the
 *               JSON-RPC protocol; any text on stdout corrupts the stream
 *               (MCP spec violation). Redirect the tee to stderr instead.
 *   'silent'  — don't mirror at all. Logs only live in the job buffer;
 *               operators get nothing on the terminal.
 */
export type LogSink = 'stdout' | 'stderr' | 'silent';

let globalLogSink: LogSink = 'stdout';

/**
 * Configure where captured console output is mirrored.
 * Call once at server/process startup, before any job runs.
 *
 * MCP stdio servers MUST call `configureJobLogSink('stderr')` before
 * accepting requests to avoid corrupting the protocol stream.
 */
export function configureJobLogSink(sink: LogSink): void {
  globalLogSink = sink;
}

export function getJobLogSink(): LogSink {
  return globalLogSink;
}

// ---------------------------------------------------------------------------
//  AsyncLocalStorage-backed per-job console routing
// ---------------------------------------------------------------------------

interface JobContext {
  job: Job;
}

const jobContext = new AsyncLocalStorage<JobContext>();

/**
 * One-time snapshot of the original console methods, captured when we
 * install our patch. We hold onto these so:
 *   1. Out-of-context console calls can fall through to the real impls.
 *   2. Mirror routing can write to the "real" stdout/stderr regardless
 *      of whether some other code (tests, linters) patched console later.
 */
let originalLog: typeof console.log | null = null;
let originalError: typeof console.error | null = null;
let originalWarn: typeof console.warn | null = null;
let consolePatchInstalled = false;

function installConsolePatch(): void {
  if (consolePatchInstalled) return;
  consolePatchInstalled = true;

  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;

  console.log = (...args: unknown[]) => {
    const ctx = jobContext.getStore();
    if (!ctx) {
      // No job running; pass through unchanged.
      originalLog!(...(args as []));
      return;
    }
    appendToJob(ctx.job, 'log', args);
    mirror('log', args);
  };

  console.error = (...args: unknown[]) => {
    const ctx = jobContext.getStore();
    if (!ctx) {
      originalError!(...(args as []));
      return;
    }
    appendToJob(ctx.job, 'error', args);
    mirror('error', args);
  };

  console.warn = (...args: unknown[]) => {
    const ctx = jobContext.getStore();
    if (!ctx) {
      originalWarn!(...(args as []));
      return;
    }
    appendToJob(ctx.job, 'warn', args);
    mirror('warn', args);
  };
}

function mirror(level: 'log' | 'error' | 'warn', args: unknown[]): void {
  // Errors always go to stderr, regardless of sink.
  if (level === 'error') {
    originalError!(...(args as []));
    return;
  }
  switch (globalLogSink) {
    case 'stdout':
      (level === 'log' ? originalLog! : originalWarn!)(...(args as []));
      return;
    case 'stderr':
      // Both log and warn funnel to stderr — MCP stdio servers need this
      // because stdout is reserved for JSON-RPC.
      originalError!(...(args as []));
      return;
    case 'silent':
      return;
  }
}

function appendToJob(job: Job, level: 'log' | 'error' | 'warn', args: unknown[]): void {
  const line = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  if (job.logs.length < MAX_LOG_LINES_PER_JOB) {
    job.logs.push(`[${level}] ${line}`);
  } else if (job.logs.length === MAX_LOG_LINES_PER_JOB) {
    job.logs.push('[system] log buffer full — further lines dropped');
  }

  // Parse well-known progress markers from orchestrator output.
  // Keep in sync with orchestrate.ts.
  if (line.includes('WAVE 1:')) job.phase = 'wave1';
  else if (line.includes('WAVE 2:')) job.phase = 'wave2';
  else if (line.includes('WAVE 3:')) job.phase = 'wave3';
  else if (line.includes('WAVE 4:')) job.phase = 'wave4';
  else if (line.includes('PHASE 2:')) job.phase = 'wave5';
  else if (line.includes('PHASE 3:')) job.phase = 'wave6';
  if (line.trim()) job.progress = line.trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

export function createJob(type: JobType, params: JobParams): Job {
  const job: Job = {
    id: randomUUID(),
    type,
    status: 'queued',
    params,
    phase: 'pending',
    progress: 'Job queued',
    logs: [],
    startedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): Job[] {
  return Array.from(jobs.values()).sort(
    (a, b) => b.startedAt.localeCompare(a.startedAt)
  );
}

/**
 * Spawn the background promise that runs the orchestrator.
 *
 * Every console.log/warn/error issued during `fn()` — including from
 * awaited sub-calls, nested promises, setTimeout callbacks, etc. — is
 * routed to THIS job's log buffer via AsyncLocalStorage. Concurrent
 * calls to runJobInBackground are safe: each gets its own ALS store,
 * so log writes never cross.
 *
 * Intentionally does NOT await: caller returns the job ID immediately.
 */
export function runJobInBackground<T>(
  job: Job,
  fn: () => Promise<T>
): void {
  installConsolePatch();

  job.status = 'running';
  job.progress = 'Starting orchestrator';

  // Run fn inside the ALS context. Any async continuation launched
  // inside fn() inherits this context.
  jobContext.run({ job }, () => {
    fn()
      .then(result => {
        job.status = 'completed';
        job.result = result;
        job.phase = 'complete';
        job.progress = 'Build completed successfully';
        job.completedAt = new Date().toISOString();
      })
      .catch(err => {
        job.status = 'failed';
        job.error = err instanceof Error ? err.message : String(err);
        job.progress = `Failed: ${job.error}`;
        job.completedAt = new Date().toISOString();
      });
  });
}

/**
 * Return a sanitized job record safe for external clients
 * (drops nothing currently, but provides a seam for redaction).
 */
export function serializeJob(job: Job): Job {
  return { ...job, logs: job.logs.slice() };
}

/**
 * For tests: clear all jobs. Not exposed via transports.
 */
export function _resetJobsForTests(): void {
  jobs.clear();
}
