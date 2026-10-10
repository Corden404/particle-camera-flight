import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeAlignedSurfaceData } from '../src/particles/surface-data.js';

const RAW_FILE = new URL('../public/scene/surface-points.bin', import.meta.url);
const ALIGNED_FILE = new URL('../public/scene/surface-points-aligned.bin', import.meta.url);

// Run this directly to derive STG2 from the checked-in STG1 file; no private GLB
// or sampling step is needed. The original baker calls the same writer.
export function writeAlignedSurfaceFile(sourcePath = RAW_FILE, targetPath = ALIGNED_FILE) {
  const source = realpathSync(sourcePath);
  const targetName = targetPath instanceof URL ? fileURLToPath(targetPath) : resolve(targetPath);
  const target = existsSync(targetName) ? realpathSync(targetName) : targetName;
  const sameFile = process.platform === 'win32' ?
    source.toLowerCase() === target.toLowerCase() : source === target;
  if (sameFile) throw Error('Aligned output must be different from its raw source file');
  const raw = readFileSync(source);
  const aligned = Buffer.from(encodeAlignedSurfaceData(raw));
  writeFileSync(target, aligned);
  return {
    bytes: aligned.length,
    rawSha256: createHash('sha256').update(raw).digest('hex'),
    alignedSha256: createHash('sha256').update(aligned).digest('hex'),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log('Wrote aligned STG2 points', JSON.stringify(writeAlignedSurfaceFile()));
}
