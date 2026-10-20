import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { createRepository, writeFile, writeJson } from './repository.mjs';

/** Copies release tooling into a fixture with no node_modules in its ancestry. */
export function createIsolatedReleaseRepository(
  root = createRepository({ publishablePackages: [] }).root,
) {
  for (const group of ['release', 'packaging']) {
    cpSync(
      new URL(`../../${group}/`, import.meta.url),
      join(root, 'scripts', group),
      { recursive: true },
    );
  }
  for (let ancestor = root; ; ancestor = dirname(ancestor)) {
    expect(existsSync(join(ancestor, 'node_modules'))).toBe(false);
    if (dirname(ancestor) === ancestor) break;
  }
  return { root, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } };
}

/** Stubs npm and gh, returning a reader for their recorded command calls. */
export function stubReleaseServices(root, { commit, versions = [] } = {}) {
  const log = join(root, 'commands.jsonl');
  writeFile(log, '');
  writeJson(join(root, 'release-services.json'), { commit, versions });
  writeJson(join(root, 'bin/package.json'), { type: 'module' });
  for (const command of ['npm', 'gh']) {
    const path = join(root, 'bin', command);
    copyFileSync(new URL('./release-service.mjs', import.meta.url), path);
    chmodSync(path, 0o755);
  }
  return () =>
    readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
}
