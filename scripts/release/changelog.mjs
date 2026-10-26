import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Requires the exact release version and nonempty notes in the top section. */
export function readChangelogNotes(changelog, version) {
  const [section] = changelog.split(/^## /m).slice(1);
  const [heading, ...body] = section?.split('\n') ?? [];
  const notes = body.join('\n').trim();
  if (heading?.trim() !== version || !notes) {
    throw new Error(`Missing changelog notes at the top for ${version}`);
  }
  return notes;
}

/** Validates release notes before a package can be published. */
export function checkPackageChangelog({ directory, manifest }, root) {
  const path = resolve(root, directory, 'CHANGELOG.md');
  let changelog;
  try {
    changelog = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Missing changelog notes for ${manifest.name}@${manifest.version}`,
      { cause: error },
    );
  }
  return readChangelogNotes(changelog, manifest.version);
}
