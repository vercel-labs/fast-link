import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { checkPackageChangelog } from './changelog.mjs';
import {
  PUBLISHED_DEPENDENCIES,
  publishedDependencies,
  readWorkspaceManifests,
} from './package-dependencies.mjs';
import { readPublishablePackages } from './publishable-packages.mjs';
import {
  compareSemanticVersions,
  isSemanticVersion,
} from './semantic-version.mjs';

const TEST_ONLY = /\.spec\.|\.test\.|__tests__\/|__mocks__\/|\/src\/testing\//;
const PUBLISHED_MANIFEST_FIELDS = [
  'name',
  'description',
  'author',
  'license',
  'repository',
  'publishConfig',
  'bin',
  'type',
  'sideEffects',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundledDependencies',
  'files',
  'exports',
  'engines',
];
const PUBLISHED_SCRIPT_FIELDS = [
  'prebuild',
  'build',
  'postbuild',
  'prepublish',
  'prepublishOnly',
  'prepack',
  'prepare',
  'postpack',
  'preinstall',
  'install',
  'postinstall',
  'publish',
  'postpublish',
];

export function checkPackageVersions({ base, root = process.cwd() }) {
  if (!base) throw new Error('A base commit is required');
  execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], {
    cwd: root,
    stdio: 'ignore',
  });

  const changedFiles = execFileSync(
    'git',
    ['diff', '--name-only', '-z', base, '--'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  const basePackages = readBasePackages(root, base);
  const currentWorkspace = readWorkspaceManifests(root);
  const baseWorkspace = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', base, '--', 'packages'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .filter((path) => /^packages\/[^/]+\/package.json$/.test(path))
    .map((path) => JSON.parse(readBaseFile(root, base, path)));
  const messages = [];
  const errors = [];

  for (const { directory, manifest: current } of readPublishablePackages(
    root,
  )) {
    const basePackage =
      basePackages.find((entry) => entry.directory === directory) ??
      basePackages.find(({ manifest }) => manifest.name === current.name);
    if (!basePackage) {
      checkPackageChangelog({ directory, manifest: current }, root);
      messages.push(
        `Package release requested for ${current.name}: new package at ${current.version}.`,
      );
      continue;
    }

    const { directory: baseDirectory, manifest: previous } = basePackage;
    const packageContentChanged = changedFiles.some(
      (path) =>
        isPackageContentInput(path, directory, current.files) ||
        isPackageContentInput(path, baseDirectory, current.files),
    );
    const currentDependencies = publishedDependencies(
      current,
      currentWorkspace,
    );
    const previousDependencies = publishedDependencies(previous, baseWorkspace);
    const manifestChanged = PUBLISHED_MANIFEST_FIELDS.some(
      (field) =>
        JSON.stringify(
          PUBLISHED_DEPENDENCIES.includes(field)
            ? currentDependencies[field]
            : current[field],
        ) !==
        JSON.stringify(
          PUBLISHED_DEPENDENCIES.includes(field)
            ? previousDependencies[field]
            : previous[field],
        ),
    );
    const publishScriptChanged = PUBLISHED_SCRIPT_FIELDS.some(
      (field) => current.scripts?.[field] !== previous.scripts?.[field],
    );
    const versionChanged = current.version !== previous.version;

    if (
      !packageContentChanged &&
      !manifestChanged &&
      !publishScriptChanged &&
      !versionChanged
    ) {
      messages.push(`No package release required for ${current.name}.`);
      continue;
    }
    if (!versionChanged) {
      errors.push(
        `${current.name} changed without a version bump (still ${current.version}).`,
      );
      continue;
    }
    if (!isSemanticVersion(previous.version)) {
      errors.push(
        `Invalid base version for ${current.name}: ${previous.version}.`,
      );
      continue;
    }
    if (compareSemanticVersions(current.version, previous.version) <= 0) {
      errors.push(
        `${current.name} version must increase: ${previous.version} -> ${current.version}.`,
      );
      continue;
    }

    checkPackageChangelog({ directory, manifest: current }, root);
    messages.push(
      `Package release requested for ${current.name}: ${previous.version} -> ${current.version}.`,
    );
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return messages;
}

function readBasePackages(root, base) {
  const declaration = readBaseFile(
    root,
    base,
    'scripts/publishable-packages.json',
  );
  if (!declaration) return [];

  return JSON.parse(declaration).map((directory) => {
    const manifest = readBaseFile(root, base, `${directory}/package.json`);
    if (!manifest) {
      throw new Error(`Declared base package ${directory} has no manifest`);
    }
    return { directory, manifest: JSON.parse(manifest) };
  });
}

function isPackageContentInput(path, directory, publishedFiles) {
  const directoryPrefix = `${directory}/`;
  const relativePath = path.startsWith(directoryPrefix)
    ? path.slice(directoryPrefix.length)
    : null;
  const publishedFileChanged =
    relativePath !== null &&
    Array.isArray(publishedFiles) &&
    publishedFiles.some(
      (publishedPath) =>
        relativePath === publishedPath ||
        relativePath.startsWith(`${publishedPath}/`),
    );

  return (
    path === 'tsconfig.base.json' ||
    path === `${directory}/tsconfig.json` ||
    path === `${directory}/tsdown.config.ts` ||
    (path.startsWith(`${directory}/src/`) && !TEST_ONLY.test(path)) ||
    publishedFileChanged
  );
}

function readBaseFile(root, base, path) {
  const exists =
    spawnSync('git', ['cat-file', '-e', `${base}:${path}`], { cwd: root })
      .status === 0;
  if (!exists) return;
  return execFileSync('git', ['show', `${base}:${path}`], {
    cwd: root,
    encoding: 'utf8',
  });
}

function run() {
  for (const message of checkPackageVersions({ base: process.argv[2] })) {
    console.log(message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
