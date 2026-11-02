import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  createRepository,
  removeRepositories,
  writeFile,
  writeJson,
} from '../release/fixtures/repository.mjs';
import { verifyBundledSkill } from './verify-bundled-skill.mjs';

afterEach(removeRepositories);

describe('bundled skill artifacts', () => {
  it.each(['core', 'react', 'next'])(
    'pnpm pack regenerates the complete skill for %s',
    (name) => {
      const { root } = createRepository();
      const directory = join(root, 'packages/core');
      const manifest = JSON.parse(
        readFileSync(`packages/${name}/package.json`, 'utf8'),
      );
      writeJson(join(directory, 'package.json'), {
        name: 'skill-pack-fixture',
        version: '1.0.0',
        files: manifest.files,
        scripts: { prepack: manifest.scripts.prepack },
      });
      mkdirSync(join(root, 'scripts/packaging'), { recursive: true });
      cpSync(
        'scripts/packaging/prepare-bundled-skill.mjs',
        join(root, 'scripts/packaging/prepare-bundled-skill.mjs'),
      );
      writeFile(join(directory, 'skills/fast-link/old.md'), 'stale');
      writeFile(join(directory, 'skills/fast-link/SKILL.md'), 'outdated');
      writeFile(
        join(root, 'skills/fast-link/assets/example.bin'),
        Buffer.from([0, 255, 128]),
      );
      const archive = join(root, 'packed.tgz');

      execFileSync('pnpm', ['--dir', directory, 'pack', '--out', archive]);

      expect(() => verifyBundledSkill(root, archive)).not.toThrow();
    },
  );

  it.each([
    ['missing', (skill) => rmSync(join(skill, 'agents/openai.yaml'))],
    ['stale', (skill) => writeFile(join(skill, 'SKILL.md'), 'outdated')],
    ['extra', (skill) => writeFile(join(skill, 'old.md'), 'stale')],
  ])('rejects %s archive contents', (_, mutate) => {
    const { root } = createRepository();
    const skill = join(root, 'package/skills/fast-link');
    cpSync(join(root, 'skills/fast-link'), skill, { recursive: true });
    mutate(skill);
    const archive = join(root, 'packed.tgz');
    execFileSync('tar', ['-czf', archive, '-C', root, 'package']);

    expect(() => verifyBundledSkill(root, archive)).toThrow(/diff/);
  });
});
