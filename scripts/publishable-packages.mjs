import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isSemanticVersion } from './semantic-version.mjs';

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

export function readPublishablePackages(root = process.cwd()) {
  const declared = JSON.parse(
    readFileSync(resolve(root, 'scripts/publishable-packages.json'), 'utf8'),
  );
  if (!Array.isArray(declared)) {
    throw new Error('Publishable packages must be an array');
  }

  const directories = new Set();
  const packageNames = new Set();
  const packages = declared.map((directory) => {
    if (
      typeof directory !== 'string' ||
      !/^packages\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory)
    ) {
      throw new Error(`Invalid package directory: ${String(directory)}`);
    }
    if (directories.has(directory)) {
      throw new Error(`Duplicate package directory: ${directory}`);
    }
    directories.add(directory);

    const manifest = JSON.parse(
      readFileSync(resolve(root, directory, 'package.json'), 'utf8'),
    );
    if (manifest.private === true) {
      throw new Error(`Publishable package ${directory} must not be private`);
    }
    if (
      typeof manifest.name !== 'string' ||
      manifest.name.length > 214 ||
      !NPM_PACKAGE_NAME.test(manifest.name) ||
      !isSemanticVersion(manifest.version)
    ) {
      throw new Error(`${directory} must have a valid npm name and version`);
    }
    if (packageNames.has(manifest.name)) {
      throw new Error(`Duplicate npm package name: ${manifest.name}`);
    }
    packageNames.add(manifest.name);

    const registry = manifest.publishConfig?.registry;
    if (
      registry !== undefined &&
      registry !== 'https://registry.npmjs.org' &&
      registry !== 'https://registry.npmjs.org/'
    ) {
      throw new Error(`${manifest.name} must publish to npmjs.org`);
    }

    return { directory, manifest };
  });

  return packages;
}
