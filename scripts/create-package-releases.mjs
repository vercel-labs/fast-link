import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { getPublishedVersions } from './detect-package-releases.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import { verifyPackedPackage } from './verify-packed-package.mjs';

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
  { directory, manifest },
  { repository, readPublishedVersions, execute },
) {
  const versions = readPublishedVersions(manifest.name);
  if (!versions?.includes(manifest.version)) return;
  const tag = `${manifest.name}@${manifest.version}`;
  const commit = JSON.parse(
    execute('npm', [
      'view',
      tag,
      'gitHead',
      '--json',
      '--registry=https://registry.npmjs.org',
      '--@fast-link:registry=https://registry.npmjs.org',
    ]).trim() || 'null',
  );
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit))
    throw new Error(`Missing published commit for ${tag}`);
  const published = JSON.parse(
    execute('git', ['show', `${commit}:${directory}/package.json`]),
  );
  verifyPackedPackage(published, manifest);
  const changelog = execute('git', [
    'show',
    `${commit}:${directory}/CHANGELOG.md`,
  ]);
  const sections = changelog.split(/^## /m).slice(1);
  const section = sections.find(
    (value) => value.split('\n')[0].trim() === manifest.version,
  );
  const notes = section?.slice(section.indexOf('\n') + 1).trim();
  if (!notes) throw new Error(`Missing changelog notes for ${tag}`);
  const api = `repos/${repository}`;
  const refs = JSON.parse(
    execute('gh', [
      'api',
      `${api}/git/matching-refs/tags/${encodeURIComponent(tag)}`,
    ]),
  );
  const existing = refs.find((ref) => ref.ref === `refs/tags/${tag}`);
  if (
    existing &&
    (existing.object.type !== 'commit' || existing.object.sha !== commit)
  ) {
    throw new Error(`Tag ${tag} does not target ${commit}`);
  }
  const releases = JSON.parse(
    execute('gh', ['api', '--paginate', '--slurp', `${api}/releases`]),
  ).flat();
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
  if (releases.some((release) => release.tag_name === tag)) return;
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
