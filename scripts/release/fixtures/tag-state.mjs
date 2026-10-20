import { execFileSync } from 'node:child_process';

import { fixtureVersions } from './repository.mjs';

/** Records GitHub tag writes while reading commits from the fixture repository. */
export function tagState(root, commit) {
  const tags = new Map();
  const tagObjects = new Map();
  const writes = [];
  return {
    tags,
    tagObjects,
    writes,
    options: {
      repository: 'example/fast-link',
      readPublishedVersions: () => [fixtureVersions.current],
      execute(command, args) {
        if (command === 'git')
          return execFileSync(command, args, { cwd: root, encoding: 'utf8' });
        if (command === 'npm') return JSON.stringify(commit);
        if (command !== 'gh') throw new Error(`Unexpected command: ${command}`);
        const endpoint = args.find((value) => value.startsWith('repos/'));
        if (args.includes('POST')) {
          if (endpoint !== 'repos/example/fast-link/git/refs')
            throw new Error(`Unexpected GitHub write: ${endpoint}`);
          const fields = Object.fromEntries(
            args
              .filter((_, index) => args[index - 1] === '-f')
              .map((value) => {
                const separator = value.indexOf('=');
                return [value.slice(0, separator), value.slice(separator + 1)];
              }),
          );
          writes.push({ endpoint, fields });
          tags.set(fields.ref, { type: 'commit', sha: fields.sha });
          return '{}';
        }
        if (endpoint.includes('/git/matching-refs/'))
          return JSON.stringify(
            [...tags].map(([ref, object]) => ({ ref, object })),
          );
        if (endpoint.includes('/git/tags/'))
          return JSON.stringify({
            object: tagObjects.get(endpoint.split('/').at(-1)),
          });
        throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
      },
    },
  };
}
