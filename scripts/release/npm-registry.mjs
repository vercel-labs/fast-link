import { spawnSync } from 'node:child_process';

export const NPM_REGISTRY_ARGS = Object.freeze([
  '--registry=https://registry.npmjs.org',
  '--@fast-link:registry=https://registry.npmjs.org',
]);

/** Reads npm versions, returning `null` when the package does not exist. */
export function getPublishedVersions(name) {
  const result = spawnSync(
    'npm',
    ['view', name, 'versions', '--json', ...NPM_REGISTRY_ARGS],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    if ((result.stderr ?? '').includes('E404')) return null;
    const detail = result.stderr?.trim() || result.error?.message || 'unknown';
    throw new Error(`Failed to inspect ${name}: ${detail}`);
  }

  const parsed = JSON.parse(result.stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Reads an exact package version's gitHead, rejecting absent or non-SHA metadata. */
export function getPublishedCommit(tag, execute) {
  const commit = JSON.parse(
    execute('npm', [
      'view',
      tag,
      'gitHead',
      '--json',
      ...NPM_REGISTRY_ARGS,
    ]).trim() || 'null',
  );
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Missing published commit for ${tag}`);
  }
  return commit;
}
