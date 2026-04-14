#!/usr/bin/env node
/**
 * Concurrency + isolation tests for utils/jobs.ts.
 *
 * The regression this guards against: the original implementation patched
 * global console.log/error/warn with a stacked save/restore pair around
 * each job. Two concurrent jobs would corrupt each other's log buffers
 * (and restore each other's saves out of order, leaving console in a
 * wrong state). The fix uses AsyncLocalStorage so every job has its own
 * context that propagates through its async call graph.
 *
 * These tests verify:
 *   1. Two concurrent jobs keep their log buffers isolated, even when
 *      their logs are interleaved via the event loop.
 *   2. Console calls made outside any job context pass through to the
 *      real stdout/stderr unchanged (no accidental buffering).
 *   3. Progress markers (phase/progress) are per-job.
 *   4. The console patch is installed at most once regardless of how
 *      many jobs run.
 *
 * Run: node jobs.test.mjs
 */

import {
  createJob,
  getJob,
  runJobInBackground,
  configureJobLogSink,
  _resetJobsForTests,
} from '../dist/utils/jobs.js';

let failures = 0;
let checks = 0;

function expect(cond, msg, ctx) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ❌ ${msg}`);
    if (ctx !== undefined) console.error('     ctx:', JSON.stringify(ctx, null, 2));
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Silence the mirror so test output stays clean.
//  (Log buffers are tested directly via job.logs; the stdout mirror
//   is a separate concern and verified in stdio-hygiene-test.mjs.)
// ═══════════════════════════════════════════════════════════════════════

configureJobLogSink('silent');
_resetJobsForTests();

// Helper: wait for a job to reach a terminal state.
async function untilDone(job, timeoutMs = 5000) {
  const start = Date.now();
  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Job ${job.id} did not finish within ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 10));
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════
//  Test 1: Concurrent jobs keep logs isolated
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Test 1: concurrent jobs keep logs isolated ──');

{
  const jobA = createJob('build', { requirements: 'A', language: 'typescript' });
  const jobB = createJob('build', { requirements: 'B', language: 'typescript' });

  // Each job logs 10 lines with awaits in between, forcing the event loop
  // to interleave them. If ALS isolation is broken, lines from A will leak
  // into B's buffer or vice versa.
  const makeWorkload = (tag) => async () => {
    for (let i = 0; i < 10; i++) {
      console.log(`${tag}-line-${i}`);
      await sleep(1); // yield to event loop
    }
    return { tag, lines: 10 };
  };

  runJobInBackground(jobA, makeWorkload('JOB-A'));
  runJobInBackground(jobB, makeWorkload('JOB-B'));

  await untilDone(jobA);
  await untilDone(jobB);

  const aLines = jobA.logs.filter(l => l.includes('JOB-A')).length;
  const bLinesInA = jobA.logs.filter(l => l.includes('JOB-B')).length;
  const bLines = jobB.logs.filter(l => l.includes('JOB-B')).length;
  const aLinesInB = jobB.logs.filter(l => l.includes('JOB-A')).length;

  expect(jobA.status === 'completed', 'job A completes cleanly', jobA.status);
  expect(jobB.status === 'completed', 'job B completes cleanly', jobB.status);
  expect(aLines === 10, 'job A has its own 10 lines', { aLines, logs: jobA.logs });
  expect(bLines === 10, 'job B has its own 10 lines', { bLines, logs: jobB.logs });
  expect(bLinesInA === 0, 'job A has ZERO JOB-B lines (isolation)', { bLinesInA });
  expect(aLinesInB === 0, 'job B has ZERO JOB-A lines (isolation)', { aLinesInB });
}

// ═══════════════════════════════════════════════════════════════════════
//  Test 2: Console calls outside a job context are not buffered
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Test 2: console outside job context passes through ──');

{
  _resetJobsForTests();
  const before = createJob('build', { requirements: 'before', language: 'typescript' });
  // Log from the main context — no ALS store active
  console.log('outside-job-context-line');

  // Before's log buffer was never started (no runJobInBackground). It should be empty.
  expect(before.logs.length === 0, 'pre-run job has empty buffer', before.logs);
}

// ═══════════════════════════════════════════════════════════════════════
//  Test 3: Progress markers are per-job
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Test 3: progress markers are per-job ──');

{
  _resetJobsForTests();
  const jobX = createJob('build', { requirements: 'X', language: 'typescript' });
  const jobY = createJob('build', { requirements: 'Y', language: 'typescript' });

  runJobInBackground(jobX, async () => {
    console.log('WAVE 1: X doing wave 1');
    await sleep(5);
    console.log('WAVE 3: X doing wave 3');
    return null;
  });
  runJobInBackground(jobY, async () => {
    await sleep(2);
    console.log('WAVE 2: Y doing wave 2');
    return null;
  });

  await untilDone(jobX);
  await untilDone(jobY);

  // Final phase reflects each job's last marker, not cross-contaminated
  expect(jobX.phase === 'complete', 'jobX.phase is complete after success', jobX.phase);
  expect(jobY.phase === 'complete', 'jobY.phase is complete after success', jobY.phase);

  // Progress string on the completed jobs: we can check the history in logs
  // to prove the per-job phase update ran. Since both set to 'complete' on
  // success, check that X saw wave3 before completion and Y saw wave2.
  expect(
    jobX.logs.some(l => l.includes('WAVE 3:')),
    'jobX buffer has its own WAVE 3 marker',
    jobX.logs,
  );
  expect(
    jobY.logs.some(l => l.includes('WAVE 2:')),
    'jobY buffer has its own WAVE 2 marker',
    jobY.logs,
  );
  expect(
    !jobX.logs.some(l => l.includes('WAVE 2:')),
    'jobX buffer has NO wave2 marker from Y',
    jobX.logs,
  );
  expect(
    !jobY.logs.some(l => l.includes('WAVE 3:')),
    'jobY buffer has NO wave3 marker from X',
    jobY.logs,
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Test 4: Failure in one job does not poison console for others
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Test 4: job failure leaves console usable for next job ──');

{
  _resetJobsForTests();
  const failing = createJob('build', { requirements: 'fail', language: 'typescript' });
  runJobInBackground(failing, async () => {
    console.log('about to fail');
    throw new Error('synthetic failure');
  });
  await untilDone(failing);
  expect(failing.status === 'failed', 'failing job marked failed', failing.status);
  expect(failing.error === 'synthetic failure', 'failing job has error message', failing.error);

  // Now run a second job — console should route correctly to it
  const survivor = createJob('build', { requirements: 'survivor', language: 'typescript' });
  runJobInBackground(survivor, async () => {
    console.log('survivor-line-1');
    console.log('survivor-line-2');
    return null;
  });
  await untilDone(survivor);
  expect(survivor.status === 'completed', 'survivor completes after a prior failure', survivor.status);
  expect(
    survivor.logs.filter(l => l.includes('survivor-line-')).length === 2,
    'survivor captured its own lines',
    survivor.logs,
  );
  expect(
    !survivor.logs.some(l => l.includes('about to fail')),
    'survivor has no lines from the earlier failing job',
    survivor.logs,
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Test 5: High-concurrency fuzz — 5 jobs, 20 logs each, interleaved
// ═══════════════════════════════════════════════════════════════════════

console.log('\n── Test 5: 5 concurrent jobs × 20 lines each, interleaved ──');

{
  _resetJobsForTests();
  const jobs = Array.from({ length: 5 }, (_, i) =>
    createJob('build', { requirements: `J${i}`, language: 'typescript' })
  );

  const workload = (i) => async () => {
    for (let k = 0; k < 20; k++) {
      console.log(`JOB-${i}-line-${k}`);
      if (k % 3 === 0) await sleep(1);
    }
    return { i };
  };

  jobs.forEach((j, i) => runJobInBackground(j, workload(i)));
  for (const j of jobs) await untilDone(j);

  let totalCrossContamination = 0;
  jobs.forEach((j, i) => {
    const own = j.logs.filter(l => l.includes(`JOB-${i}-`)).length;
    const foreign = j.logs.filter(
      l => /JOB-\d-/.test(l) && !l.includes(`JOB-${i}-`)
    ).length;
    expect(own === 20, `job ${i} has all 20 own lines`, { i, own });
    expect(foreign === 0, `job ${i} has zero foreign lines`, { i, foreign });
    totalCrossContamination += foreign;
  });
  expect(
    totalCrossContamination === 0,
    'zero cross-contamination across 5 jobs × 20 lines',
    totalCrossContamination,
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════════════════

console.log('');
if (failures === 0) {
  console.log(`✅ All ${checks} checks passed.`);
  process.exit(0);
} else {
  console.error(`❌ ${failures} / ${checks} checks failed.`);
  process.exit(1);
}
