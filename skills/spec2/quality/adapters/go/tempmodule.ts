/**
 * Temporary Go module helper shared by go vet / golangci-lint / gosec adapters.
 *
 * All three tools require a Go module context (go.mod present in cwd or an
 * ancestor directory) to run. Spec2's Wave 6 codegen produces a single file
 * outside any module, so adapters must materialise a disposable module
 * around the file before invoking the tool.
 *
 * Contract:
 *   - Creates `<tmpdir>/spec2-go-XXX/{go.mod, <fileName>}`.
 *   - Runs the provided `body` with that directory as cwd.
 *   - Cleans up the directory regardless of body success/failure.
 *   - If the caller already passes a `cwd` pointing at an existing module
 *     (detected via go.mod), we skip the temp setup and use that cwd
 *     directly — preserves normal project-mode usage.
 */

import { existsSync } from 'fs';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename, dirname } from 'path';

export interface TempModuleContext {
  cwd: string;
  filePath: string;
  cleanup: () => Promise<void>;
}

export async function withTempGoModule<T>(
  code: string,
  fileName: string,
  body: (ctx: TempModuleContext) => Promise<T>,
  existingCwd?: string,
): Promise<T> {
  // If caller supplies a cwd that is already inside a Go module, honor it.
  if (existingCwd && cwdIsInModule(existingCwd)) {
    const filePath = join(existingCwd, basename(fileName));
    // Don't write the file — assume caller has already placed it.
    return await body({
      cwd: existingCwd,
      filePath,
      cleanup: async () => {},
    });
  }

  const dir = await mkdtemp(join(tmpdir(), 'spec2-go-'));
  const modName = `spec2sandbox.local/${basename(dir)}`;
  const goModPath = join(dir, 'go.mod');
  const fileBase = basename(fileName);
  const filePath = join(dir, fileBase);

  await writeFile(
    goModPath,
    `module ${modName}\n\ngo 1.21\n`,
    'utf8',
  );
  await writeFile(filePath, code, 'utf8');

  const cleanup = async () => {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup — OS will gc temp eventually.
    }
  };

  try {
    return await body({ cwd: dir, filePath, cleanup });
  } finally {
    await cleanup();
  }
}

function cwdIsInModule(cwd: string): boolean {
  // Walk up looking for go.mod. Bounded to 8 levels to avoid pathological
  // filesystem walks.
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'go.mod'))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/** Timestamp helper used by every adapter's QualityIssue output. */
export function nowIso(): string {
  return new Date().toISOString();
}
