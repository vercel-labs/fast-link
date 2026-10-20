import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const PUBLISHED_DEPENDENCIES = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Reads the public-package workspace, independently of publication enablement. */
export function readWorkspaceManifests(root) {
  return readdirSync(resolve(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(
        readFileSync(
          resolve(root, 'packages', entry.name, 'package.json'),
          'utf8',
        ),
      ),
    );
}

/** Resolves pnpm workspace ranges as they appear in published manifests. */
export function publishedDependencies(manifest, workspace) {
  return Object.fromEntries(
    PUBLISHED_DEPENDENCIES.map((field) => [
      field,
      Object.fromEntries(
        Object.entries(manifest[field] ?? {}).map(([name, range]) => {
          if (!range.startsWith('workspace:')) return [name, range];
          const specifier = range.slice('workspace:'.length);
          if (!['*', '^', '~'].includes(specifier)) {
            if (specifier.includes('@') || specifier.includes('/')) {
              throw new Error(
                `Unsupported workspace dependency ${name}: ${range}`,
              );
            }
            return [name, specifier];
          }
          const dependency = workspace.find((entry) => entry.name === name);
          if (!dependency)
            throw new Error(`Missing workspace dependency ${name}`);
          return [
            name,
            `${specifier === '*' ? '' : specifier}${dependency.version}`,
          ];
        }),
      ),
    ]),
  );
}
