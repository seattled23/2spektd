#!/usr/bin/env node
/**
 * spec2-mcp — MCP server exposing spec2 as tools.
 *
 * Transport: stdio (the canonical MCP transport for local tooling).
 *
 * Architecture: thin wrapper. All orchestrator logic lives in
 * ../spec2/dist/orchestrate.js. Job tracking lives in
 * ../spec2/dist/utils/jobs.js. This file only translates between
 * MCP's request/response format and those imported functions.
 *
 * IMPORTANT: stdout is reserved for the MCP JSON-RPC protocol. All
 * server-side logs MUST go to stderr (use console.error, never
 * console.log). Any stray stdout write will corrupt the MCP stream
 * and disconnect the client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
//  Resolve + load the spec2 core modules (sibling skill)
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
    configureJobLogSink: (sink: 'stdout' | 'stderr' | 'silent') => void;
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

// ---------------------------------------------------------------------------
//  Tool schemas (JSON Schema — sent to MCP clients)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'spec2_build',
    description:
      'Start a new spec2 build from requirements. Runs asynchronously — returns a job ID immediately. Poll with spec2_status(jobId). Build takes several minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        requirements: {
          type: 'string',
          description: 'Natural-language requirements for the system to build.',
        },
        language: {
          type: 'string',
          enum: ['python', 'typescript', 'javascript', 'go'],
          description: 'Target implementation language. Defaults to typescript.',
        },
      },
      required: ['requirements'],
    },
  },
  {
    name: 'spec2_resume',
    description:
      'Resume an interrupted spec2 build from the latest checkpoint at .spec2/checkpoints/latest.json. Runs asynchronously — returns a job ID immediately.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'spec2_status',
    description:
      'Get status. With jobId: returns that job\'s status, phase, progress, and recent log tail. Without jobId: returns the current checkpoint on disk (project-level progress).',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description:
            'Optional job ID returned by spec2_build or spec2_resume. Omit to query the on-disk checkpoint instead.',
        },
      },
    },
  },
  {
    name: 'spec2_jobs',
    description: 'List all jobs known to this MCP server process.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'spec2_logs',
    description: 'Fetch captured log lines from a specific job.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID.' },
        tail: {
          type: 'number',
          description: 'Return only the last N lines. Omit for all.',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'spec2_check_tests',
    description:
      'Analyze test code for hollow patterns: zero assertions, tautological assertions (assert True, expect(1).toBe(1)), empty bodies, mock-only tests, silent error swallowing, low assertion density. Returns a report with pass/fail and specific issues per test. Supported languages: typescript, javascript, python.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Test file source code.',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'go'],
          description:
            'Language of the test code. Unsupported languages return passed=true with supported=false.',
        },
      },
      required: ['code', 'language'],
    },
  },
];

// ---------------------------------------------------------------------------
//  Tool handlers
// ---------------------------------------------------------------------------

function readCheckpointFromDisk(): Checkpoint | null {
  const path = '.spec2/checkpoints/latest.json';
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function makeHandlers(core: CoreModules) {
  return {
    spec2_build: (args: { requirements: string; language?: string }) => {
      if (!args.requirements || typeof args.requirements !== 'string') {
        throw new Error('spec2_build requires a non-empty `requirements` string.');
      }
      const language = args.language ?? 'typescript';
      const job = core.jobs.createJob('build', {
        requirements: args.requirements,
        language,
      });
      core.jobs.runJobInBackground(job, () =>
        core.orchestrate.orchestrateSpec2(args.requirements, language),
      );
      return {
        jobId: job.id,
        status: job.status,
        message:
          `Build started. Poll spec2_status(jobId="${job.id}") for progress. ` +
          `Expected duration: several minutes.`,
      };
    },

    spec2_resume: () => {
      const checkpoint = readCheckpointFromDisk();
      if (!checkpoint) {
        throw new Error(
          'No checkpoint found at .spec2/checkpoints/latest.json. ' +
            'Nothing to resume. Use spec2_build to start a new build.',
        );
      }
      if (checkpoint.phase === 'complete') {
        return {
          status: 'already_complete',
          message:
            'This project already finished all waves. Use spec2_build to start a new one.',
        };
      }
      const job = core.jobs.createJob('resume', {
        requirements: checkpoint.requirements,
        language: checkpoint.language,
      });
      core.jobs.runJobInBackground(job, () =>
        core.orchestrate.orchestrateSpec2FromCheckpoint(checkpoint as any),
      );
      return {
        jobId: job.id,
        status: job.status,
        resumingFrom: checkpoint.phase,
        message:
          `Resume started from phase "${checkpoint.phase}". ` +
          `Poll spec2_status(jobId="${job.id}") for progress.`,
      };
    },

    spec2_status: (args: { jobId?: string }) => {
      if (args.jobId) {
        const job = core.jobs.getJob(args.jobId);
        if (!job) throw new Error(`Unknown job: ${args.jobId}`);
        const serialized = core.jobs.serializeJob(job);
        // Trim logs to tail for bandwidth — clients can fetch full via spec2_logs
        return {
          ...serialized,
          logs: serialized.logs.slice(-30),
          logsTruncated: serialized.logs.length > 30,
          totalLogLines: serialized.logs.length,
        };
      }
      const checkpoint = readCheckpointFromDisk();
      if (!checkpoint) {
        return {
          source: 'checkpoint',
          status: 'no_checkpoint',
          message:
            'No checkpoint found at .spec2/checkpoints/latest.json. ' +
            'No build has been started in this directory.',
        };
      }
      return {
        source: 'checkpoint',
        phase: checkpoint.phase,
        timestamp: checkpoint.timestamp,
        language: checkpoint.language,
        canResume: checkpoint.phase !== 'complete',
      };
    },

    spec2_jobs: () => {
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
        })),
      };
    },

    spec2_logs: (args: { jobId: string; tail?: number }) => {
      const job = core.jobs.getJob(args.jobId);
      if (!job) throw new Error(`Unknown job: ${args.jobId}`);
      const serialized = core.jobs.serializeJob(job);
      const logs =
        args.tail && args.tail > 0
          ? serialized.logs.slice(-args.tail)
          : serialized.logs;
      return {
        jobId: job.id,
        totalLines: serialized.logs.length,
        returned: logs.length,
        logs,
      };
    },

    spec2_check_tests: async (args: { code: string; language: string }) => {
      if (typeof args.code !== 'string' || !args.code) {
        throw new Error('spec2_check_tests requires a non-empty `code` string.');
      }
      if (!args.language) {
        throw new Error('spec2_check_tests requires `language`.');
      }
      return await core.antiHollow.detectHollowTests(args.code, args.language);
    },
  };
}

// ---------------------------------------------------------------------------
//  Main — wire the MCP server
// ---------------------------------------------------------------------------

async function main() {
  const core = await loadCore();

  // CRITICAL: stdio MCP reserves stdout for JSON-RPC. Orchestrator output
  // (console.log) must NOT reach stdout or we violate the MCP spec and
  // corrupt the protocol stream. Route it to stderr instead — MCP clients
  // explicitly ignore server stderr per the spec.
  core.jobs.configureJobLogSink('stderr');

  const handlers = makeHandlers(core);

  const server = new Server(
    { name: 'spec2', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    const fn = (handlers as Record<string, (a: any) => unknown>)[name];
    if (!fn) {
      throw new Error(`Unknown tool: ${name}`);
    }
    try {
      const result = await fn(args ?? {});
      return {
        content: [
          { type: 'text', text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for JSON-RPC — all server chatter goes to stderr
  console.error('[spec2-mcp] Server ready on stdio');
}

main().catch(err => {
  console.error('[spec2-mcp] Fatal:', err);
  process.exit(1);
});
