#!/usr/bin/env node
/**
 * spec2-api — HTTP API for spec2.
 *
 * Thin Fastify wrapper. All orchestrator logic lives in
 * ../spec2/dist/orchestrate.js; job tracking in ../spec2/dist/utils/jobs.js.
 *
 * Transport model mirrors spec2-mcp: build/resume return a job ID immediately,
 * clients poll /jobs/:id for progress. This lets CI scripts and agents drive
 * spec2 without long-lived HTTP connections.
 *
 * Security posture: localhost-only by default, no auth. This is for trusted
 * automation, not public exposure.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
//  Load sibling core modules
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE_DIST = resolve(HERE, '..', '..', 'spec2', 'dist');

interface BuildResult {
  components: string[];
  validationStatus: 'PASSED' | 'FAILED';
  outputPath: string;
}

interface Checkpoint {
  phase: string;
  timestamp: string;
  requirements: string;
  language: string;
  [k: string]: unknown;
}

interface Job {
  id: string;
  type: 'build' | 'resume';
  status: 'queued' | 'running' | 'completed' | 'failed';
  params: { requirements?: string; language?: string };
  phase: string;
  progress: string;
  logs: string[];
  startedAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

interface HollowReport {
  language: string;
  supported: boolean;
  totalTests: number;
  totalAssertions: number;
  assertionDensity: number;
  issues: Array<{
    severity: 'error' | 'warning';
    rule: string;
    testName: string;
    location?: { line?: number };
    detail: string;
  }>;
  passed: boolean;
}

interface CoreModules {
  orchestrate: {
    orchestrateSpec2: (r: string, l: string) => Promise<BuildResult>;
    orchestrateSpec2FromCheckpoint: (c: Checkpoint) => Promise<BuildResult>;
  };
  jobs: {
    createJob: (type: 'build' | 'resume', params: Job['params']) => Job;
    getJob: (id: string) => Job | undefined;
    listJobs: () => Job[];
    runJobInBackground: <T>(job: Job, fn: () => Promise<T>) => void;
    serializeJob: (job: Job) => Job;
  };
  antiHollow: {
    detectHollowTests: (code: string, language: string) => Promise<HollowReport>;
  };
}

async function loadCore(): Promise<CoreModules> {
  const orchestratePath = resolve(CORE_DIST, 'orchestrate.js');
  const jobsPath = resolve(CORE_DIST, 'utils', 'jobs.js');
  const antiHollowPath = resolve(CORE_DIST, 'verification', 'anti-hollow.js');
  for (const p of [orchestratePath, jobsPath, antiHollowPath]) {
    if (!existsSync(p)) {
      throw new Error(
        `spec2 core not built. Missing ${p}. ` +
          `Build with: cd ${resolve(CORE_DIST, '..')} && npm run build`,
      );
    }
  }
  const orchestrate = (await import(orchestratePath)) as CoreModules['orchestrate'];
  const jobs = (await import(jobsPath)) as CoreModules['jobs'];
  const antiHollow = (await import(antiHollowPath)) as CoreModules['antiHollow'];
  return { orchestrate, jobs, antiHollow };
}

function readCheckpointFromDisk(): Checkpoint | null {
  const path = '.spec2/checkpoints/latest.json';
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Route registration
// ---------------------------------------------------------------------------

async function registerRoutes(
  app: FastifyInstance,
  core: CoreModules,
): Promise<void> {
  // -----------------------------------------------------------------------
  //  GET /health
  // -----------------------------------------------------------------------
  app.get('/health', async () => ({
    status: 'ok',
    service: 'spec2-api',
    version: '0.1.0',
  }));

  // -----------------------------------------------------------------------
  //  POST /builds  { requirements, language? }
  // -----------------------------------------------------------------------
  app.post<{ Body: { requirements: string; language?: string } }>(
    '/builds',
    {
      schema: {
        body: {
          type: 'object',
          required: ['requirements'],
          properties: {
            requirements: { type: 'string', minLength: 1 },
            language: {
              type: 'string',
              enum: ['python', 'typescript', 'javascript', 'go'],
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { requirements, language = 'typescript' } = req.body;
      const job = core.jobs.createJob('build', { requirements, language });
      core.jobs.runJobInBackground(job, () =>
        core.orchestrate.orchestrateSpec2(requirements, language),
      );
      reply.code(202);
      return {
        jobId: job.id,
        status: job.status,
        pollUrl: `/jobs/${job.id}`,
      };
    },
  );

  // -----------------------------------------------------------------------
  //  POST /resume
  // -----------------------------------------------------------------------
  app.post('/resume', async (_req, reply) => {
    const checkpoint = readCheckpointFromDisk();
    if (!checkpoint) {
      reply.code(404);
      return {
        error: 'no_checkpoint',
        message:
          'No checkpoint found at .spec2/checkpoints/latest.json. Nothing to resume.',
      };
    }
    if (checkpoint.phase === 'complete') {
      reply.code(409);
      return {
        error: 'already_complete',
        message:
          'This project already finished all waves. Use POST /builds to start a new one.',
      };
    }
    const job = core.jobs.createJob('resume', {
      requirements: checkpoint.requirements,
      language: checkpoint.language,
    });
    core.jobs.runJobInBackground(job, () =>
      core.orchestrate.orchestrateSpec2FromCheckpoint(checkpoint as any),
    );
    reply.code(202);
    return {
      jobId: job.id,
      status: job.status,
      resumingFrom: checkpoint.phase,
      pollUrl: `/jobs/${job.id}`,
    };
  });

  // -----------------------------------------------------------------------
  //  GET /jobs
  // -----------------------------------------------------------------------
  app.get('/jobs', async () => {
    const all = core.jobs.listJobs().map(core.jobs.serializeJob);
    return {
      count: all.length,
      jobs: all.map(j => ({
        id: j.id,
        type: j.type,
        status: j.status,
        phase: j.phase,
        progress: j.progress,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        error: j.error,
      })),
    };
  });

  // -----------------------------------------------------------------------
  //  GET /jobs/:id
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = core.jobs.getJob(req.params.id);
    if (!job) {
      reply.code(404);
      return { error: 'unknown_job', jobId: req.params.id };
    }
    const s = core.jobs.serializeJob(job);
    return {
      ...s,
      logs: s.logs.slice(-30),
      logsTruncated: s.logs.length > 30,
      totalLogLines: s.logs.length,
    };
  });

  // -----------------------------------------------------------------------
  //  GET /jobs/:id/logs?tail=N
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string }; Querystring: { tail?: string } }>(
    '/jobs/:id/logs',
    async (req, reply) => {
      const job = core.jobs.getJob(req.params.id);
      if (!job) {
        reply.code(404);
        return { error: 'unknown_job', jobId: req.params.id };
      }
      const s = core.jobs.serializeJob(job);
      const tailNum = req.query.tail ? parseInt(req.query.tail, 10) : undefined;
      const logs =
        tailNum && tailNum > 0 ? s.logs.slice(-tailNum) : s.logs;
      return {
        jobId: job.id,
        totalLines: s.logs.length,
        returned: logs.length,
        logs,
      };
    },
  );

  // -----------------------------------------------------------------------
  //  POST /check-tests  { code, language }
  // -----------------------------------------------------------------------
  app.post<{ Body: { code: string; language: string } }>(
    '/check-tests',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code', 'language'],
          properties: {
            code: { type: 'string', minLength: 1 },
            language: {
              type: 'string',
              enum: ['typescript', 'javascript', 'python', 'go'],
            },
          },
        },
      },
    },
    async req => {
      const { code, language } = req.body;
      return await core.antiHollow.detectHollowTests(code, language);
    },
  );

  // -----------------------------------------------------------------------
  //  GET /checkpoint
  // -----------------------------------------------------------------------
  app.get('/checkpoint', async (_req, reply) => {
    const checkpoint = readCheckpointFromDisk();
    if (!checkpoint) {
      reply.code(404);
      return {
        error: 'no_checkpoint',
        message: 'No checkpoint found at .spec2/checkpoints/latest.json.',
      };
    }
    return {
      phase: checkpoint.phase,
      timestamp: checkpoint.timestamp,
      language: checkpoint.language,
      canResume: checkpoint.phase !== 'complete',
    };
  });
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

export async function buildServer(): Promise<FastifyInstance> {
  const core = await loadCore();
  // Pretty-print logs in dev, JSON in prod. pino-pretty is a devDependency —
  // don't require it at runtime in production to avoid bundling dev tooling.
  const isProd = process.env.NODE_ENV === 'production';
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l' },
          },
    },
  });
  await registerRoutes(app, core);
  return app;
}

async function main() {
  const app = await buildServer();
  const port = parseInt(process.env.PORT ?? '3737', 10);
  const host = process.env.HOST ?? '127.0.0.1';

  try {
    await app.listen({ port, host });
    app.log.info(`spec2-api ready on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Only run main if this file is the entry point (not imported for testing)
const entryPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath === invokedPath) {
  main().catch(err => {
    console.error('[spec2-api] Fatal:', err);
    process.exit(1);
  });
}
