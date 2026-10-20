import { join } from 'node:path';

import { createPackageTags } from './create-package-tags.mjs';
import {
  removeRepositories,
  publishedCommit,
  createPackageGraph,
  writeFile,
  runGit,
} from './fixtures/repository.mjs';
import { tagState } from './fixtures/tag-state.mjs';

afterEach(removeRepositories);

describe('GitHub package tags', () => {
  it('tags the published commit rather than current HEAD', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    writeFile(
      join(root, 'packages/core/CHANGELOG.md'),
      '# Changelog\n\n## 1.2.3\n\n- Unpublished edits.\n',
    );
    runGit(root, 'add', '.');
    runGit(root, 'commit', '--quiet', '-m', 'later changelog edits');
    const state = tagState(root, commit);

    createPackageTags(packages.slice(0, 1), state.options);

    expect(state.writes).toEqual([
      {
        endpoint: 'repos/example/fast-link/git/refs',
        fields: { ref: 'refs/tags/@fast-link/core@1.2.3', sha: commit },
      },
    ]);
  });

  it('leaves matching tags unchanged on repeat runs', () => {
    const { root, packages } = createPackageGraph();
    const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
    createPackageTags(packages, state.options);
    state.writes.length = 0;
    createPackageTags(packages, state.options);
    expect(state.writes).toEqual([]);
  });

  it('accepts an annotated tag at the published commit', () => {
    const { root, packages } = createPackageGraph();
    const commit = runGit(root, 'rev-parse', 'HEAD');
    const tag = '@fast-link/core@1.2.3';
    runGit(
      root,
      '-c',
      'tag.gpgsign=false',
      'tag',
      '-a',
      tag,
      '-m',
      'Existing release tag',
    );
    const tagObject = runGit(root, 'rev-parse', tag);
    const state = tagState(root, commit);
    state.tags.set(`refs/tags/${tag}`, { type: 'tag', sha: tagObject });
    state.tagObjects.set(tagObject, {
      type: 'commit',
      sha: runGit(root, 'rev-parse', `${tag}^{commit}`),
    });

    createPackageTags(packages.slice(0, 1), state.options);

    expect(state.writes).toEqual([]);
    expect(state.tags.get(`refs/tags/${tag}`)).toEqual({
      type: 'tag',
      sha: tagObject,
    });
  });

  it.each([
    ['lightweight', 'commit'],
    ['annotated', 'tag'],
  ])(
    'rejects an existing %s tag at a different commit without moving it',
    (_, type) => {
      const { root, packages } = createPackageGraph();
      const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
      state.tags.set('refs/tags/@fast-link/core@1.2.3', {
        type,
        sha: publishedCommit,
      });
      state.tagObjects.set(publishedCommit, {
        type: 'commit',
        sha: publishedCommit,
      });
      expect(() =>
        createPackageTags(packages.slice(0, 1), state.options),
      ).toThrow('Tag @fast-link/core@1.2.3 does not target');
      expect(state.writes).toEqual([]);
    },
  );

  it('creates other package tags when one fails, then recovers it', () => {
    const { root, packages } = createPackageGraph();
    const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
    const execute = state.options.execute;
    let fail = true;
    state.options.execute = (command, args) => {
      if (
        fail &&
        command === 'gh' &&
        args.includes('POST') &&
        args.includes('ref=refs/tags/@fast-link/core@1.2.3')
      )
        throw new Error('GitHub unavailable');
      return execute(command, args);
    };
    expect(() => createPackageTags(packages, state.options)).toThrow(
      'GitHub unavailable',
    );
    expect([...state.tags.keys()]).toEqual([
      'refs/tags/@fast-link/react@1.2.3',
      'refs/tags/@fast-link/next@1.2.3',
    ]);
    fail = false;
    state.writes.length = 0;
    createPackageTags(packages, state.options);
    expect(state.writes.map((write) => write.fields.ref)).toEqual([
      'refs/tags/@fast-link/core@1.2.3',
    ]);
  });

  it.each(['', 'null', '"main"', '"abc123"'])(
    'refuses GitHub writes without an exact published commit: %s',
    (gitHead) => {
      const { root, packages } = createPackageGraph();
      const state = tagState(root, runGit(root, 'rev-parse', 'HEAD'));
      const execute = state.options.execute;
      state.options.execute = (command, args) =>
        command === 'npm' ? gitHead : execute(command, args);
      expect(() => createPackageTags(packages, state.options)).toThrow(
        'Missing published commit',
      );
      expect(state.writes).toEqual([]);
    },
  );
});
