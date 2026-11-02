import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function verifyBundledSkill(root, archive) {
  const extracted = mkdtempSync(join(tmpdir(), 'fast-link-skill-'));
  try {
    execFileSync('tar', [
      '-xf',
      archive,
      '-C',
      extracted,
      'package/skills/fast-link',
    ]);
    execFileSync('diff', [
      '-r',
      join(root, 'skills/fast-link'),
      join(extracted, 'package/skills/fast-link'),
    ]);
  } finally {
    rmSync(extracted, { recursive: true, force: true });
  }
}
