/**
 * Utilities to lock/unlock specs with SHA256 checksums
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export async function saveAndLock(filename: string, content: string): Promise<void> {
  const specsDir = '.spec2/specs';
  await fs.mkdir(specsDir, { recursive: true });

  const filepath = path.join(specsDir, filename);
  await fs.writeFile(filepath, content, 'utf-8');

  // Generate SHA256 checksum
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  // Save checksum
  const checksumFile = `${filepath}.sha256`;
  await fs.writeFile(checksumFile, hash, 'utf-8');

  console.log(`    📄 Saved: ${filename} (checksum: ${hash.substring(0, 8)}...)`);
}
