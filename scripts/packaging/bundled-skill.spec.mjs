import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  createArtifacts,
  createPackageGraph,
  publishedCommit,
  removeRepositories,
  writeFile,
  writeJson,
} from '../release/fixtures/repository.mjs';
import { prepareBundledSkill } from './bundled-skill.mjs';
import { archiveDigest, verifyReleaseArtifacts } from './release-artifacts.mjs';

afterEach(removeRepositories);

describe('bundled skill artifacts', () => {
  it('replaces stale generated files and copies future resources', () => {
    const { root } = createPackageGraph();
    const directory = 'packages/next';
    writeFile(join(root, directory, 'skills/fast-link/old.md'), 'stale');
    writeFile(join(root, directory, 'skills/fast-link/SKILL.md'), 'outdated');
    writeFile(
      join(root, 'skills/fast-link/assets/example.bin'),
      Buffer.from([0, 255, 128]),
    );

    prepareBundledSkill(root, directory);

    expect(existsSync(join(root, directory, 'skills/fast-link/old.md'))).toBe(
      false,
    );
    expect(
      readFileSync(join(root, directory, 'skills/fast-link/SKILL.md'), 'utf8'),
    ).toBe('# Fast Link\n\n[Adapters](references/adapters.md#setup)\n');
    expect(
      readFileSync(
        join(root, directory, 'skills/fast-link/assets/example.bin'),
      ),
    ).toEqual(Buffer.from([0, 255, 128]));
  });

  it('verifies the full skill in all three archives, including binary resources', () => {
    const { root, packages } = createPackageGraph();
    writeFile(
      join(root, 'skills/fast-link/assets/example.bin'),
      Buffer.from([0, 255, 128]),
    );
    createArtifacts(root, packages);

    expect(verify(root).map(({ manifest }) => manifest.name)).toEqual([
      '@fast-link/core',
      '@fast-link/react',
      '@fast-link/next',
    ]);
  });

  it.each([
    [
      'missing',
      (root) =>
        rmSync(join(root, 'package/skills/fast-link/agents/openai.yaml')),
      'Bundled skill files differ',
    ],
    [
      'stale',
      (root) =>
        writeFile(
          join(root, 'package/skills/fast-link/references/adapters.md'),
          'stale',
        ),
      'Bundled skill content differs',
    ],
    [
      'extra',
      (root) => writeFile(join(root, 'package/skills/fast-link/old.md'), 'old'),
      'Bundled skill files differ',
    ],
  ])(
    'rejects %s payload even with a matching archive digest',
    (_, mutate, message) => {
      const { root, packages } = createPackageGraph();
      createArtifacts(root, packages);
      mutate(root);
      const archive = join(root, 'next.tgz');
      execFileSync('tar', ['-czf', archive, '-C', root, 'package']);
      const metadata = JSON.parse(
        readFileSync(join(root, 'release-artifacts.json'), 'utf8'),
      );
      metadata.packages[2].sha256 = archiveDigest(archive);
      writeJson(join(root, 'release-artifacts.json'), metadata);

      expect(() => verify(root)).toThrow(message);
    },
  );

  it.each([
    '[Missing](references/missing.md)',
    '[Outside](../README.md)',
    '[Missing][guide]\n\n[guide]: references/missing.md',
  ])(
    'rejects a broken local reference even when it matches source: %s',
    (link) => {
      const { root, packages } = createPackageGraph();
      writeFile(
        join(root, 'skills/fast-link/SKILL.md'),
        `# Skill\n\n${link}\n`,
      );
      createArtifacts(root, packages);

      expect(() => verify(root)).toThrow(
        'Broken local skill link: SKILL.md ->',
      );
    },
  );

  it('resolves nested and encoded paths in inline and reference links', () => {
    const { root, packages } = createPackageGraph();
    writeFile(
      join(root, 'skills/fast-link/references/adapters.md'),
      '# Setup\n\n[Skill](../SKILL.md)\n![Example](<../assets/an example.svg>)\n[Example][image]\n\n[image]: ../assets/an%20example.svg\n',
    );
    writeFile(join(root, 'skills/fast-link/assets/an example.svg'), '<svg/>');
    createArtifacts(root, packages);

    expect(verify(root)).toHaveLength(3);
  });
});

function verify(root) {
  return verifyReleaseArtifacts({
    root,
    archiveDirectory: root,
    commit: publishedCommit,
    execute: (command, args) => execFileSync(command, args),
  });
}
