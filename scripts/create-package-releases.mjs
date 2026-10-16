import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { readChangelogNotes } from './changelog.mjs';
import { getPublishedCommit, getPublishedVersions } from './npm-registry.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackageIdentity } from './verify-packed-package.mjs';

/**
 * Recovers missing tags and Releases for published, allowlisted package versions.
 * Existing tags must match npm's gitHead. Failures are reported after all packages.
 */
export function createPackageReleases(packages, options) {
  const errors = [];
  for (const entry of packages) {
    try {
      createPackageRelease(entry, options);
    } catch (error) {
      errors.push(
        new Error(`${entry.manifest.name}: ${error.message}`, { cause: error }),
      );
    }
  }
  if (errors.length > 0)
    throw new AggregateError(
      errors,
      errors.map((error) => error.message).join('\n'),
    );
}

function createPackageRelease(
  entry,
  { repository, readPublishedVersions, execute },
) {
  const { manifest } = entry;
  const versions = readPublishedVersions(manifest.name);
  if (!versions?.includes(manifest.version)) return;
  const release = readPublishedRelease(entry, execute);
  ensureGitHubRelease(release, repository, execute);
}

function readPublishedRelease({ directory, manifest }, execute) {
  const tag = `${manifest.name}@${manifest.version}`;
  const commit = getPublishedCommit(tag, execute);
  const published = JSON.parse(
    execute('git', ['show', `${commit}:${directory}/package.json`]),
  );
  verifyPackageIdentity(published, manifest);
  const changelog = execute('git', [
    'show',
    `${commit}:${directory}/CHANGELOG.md`,
  ]);
  const notes = readChangelogNotes(changelog, manifest.version);
  return { tag, commit, notes };
}

function ensureGitHubRelease({ tag, commit, notes }, repository, execute) {
  const api = `repos/${repository}`;
  const refs = JSON.parse(
    execute('gh', [
      'api',
      `${api}/git/matching-refs/tags/${encodeURIComponent(tag)}`,
    ]),
  );
  const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`);
  if (existing) verifyTagTarget(existing.object, { tag, commit }, api, execute);
  const releaseExists = hasGitHubRelease(api, tag, execute);
  if (!existing)
    execute('gh', [
      'api',
      '--method',
      'POST',
      `${api}/git/refs`,
      '-f',
      `ref=refs/tags/${tag}`,
      '-f',
      `sha=${commit}`,
    ]);
  if (releaseExists) return;
  execute('gh', [
    'api',
    '--method',
    'POST',
    `${api}/releases`,
    '-f',
    `tag_name=${tag}`,
    '-f',
    `target_commitish=${commit}`,
    '-f',
    `name=${tag}`,
    '-f',
    `body=${notes}`,
    '-f',
    'make_latest=false',
  ]);
}

function hasGitHubRelease(api, tag, execute) {
  try {
    execute('gh', [
      'api',
      '--include',
      '--silent',
      `${api}/releases/tags/${encodeURIComponent(tag)}`,
    ]);
    return true;
  } catch (error) {
    // gh includes response headers on stdout even when an HTTP error exits nonzero.
    if (/^HTTP\/\S+ 404(?:\s|$)/.test(String(error.stdout ?? ''))) return false;
    throw error;
  }
}

function verifyTagTarget(object, { tag, commit }, api, execute) {
  let target = object;
  while (target.type === 'tag') {
    target = JSON.parse(
      execute('gh', ['api', `${api}/git/tags/${target.sha}`]),
    ).object;
  }
  if (target.type !== 'commit' || target.sha !== commit) {
    throw new Error(`Tag ${tag} does not target ${commit}`);
  }
}

function run() {
  const packages = readPublishablePackages();
  if (packages.length === 0) return;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required');
  createPackageReleases(packages, {
    repository,
    readPublishedVersions: getPublishedVersions,
    execute(command, args) {
      return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
