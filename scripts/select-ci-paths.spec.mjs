import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./select-ci-paths.sh', import.meta.url));
const fixtures = [];

afterEach(() => {
  for (const root of fixtures.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('select-ci-paths.sh', () => {
  it.each([
    ['root Markdown', ['README.md'], 'true'],
    ['docs Markdown', ['docs/guides/start.md'], 'true'],
    [
      'skill Markdown and YAML',
      ['skills/fast-link/SKILL.md', 'skills/fast-link/agents/openai.yaml'],
      'true',
    ],
    [
      'combined allowed paths',
      ['README.md', 'docs/guide.md', 'skills/fast-link/agents/openai.yaml'],
      'true',
    ],
    ['package README', ['packages/core/README.md'], 'false'],
    ['mixed paths', ['README.md', 'packages/core/src/index.ts'], 'false'],
    ['workflow', ['.github/workflows/ci.yml'], 'false'],
    ['root config', ['package.json'], 'false'],
    ['other skill', ['skills/other/SKILL.md'], 'false'],
    ['testing skill', ['.agents/skills/testing/SKILL.md'], 'false'],
    ['Markdown in another directory', ['notes/README.md'], 'false'],
    ['non-Markdown docs', ['docs/image.svg'], 'false'],
    ['filename with spaces', ['docs/start here.md'], 'true'],
  ])('%s selects the expected CI path', (_, paths, expected) => {
    const { root, base } = createRepository();
    for (const path of paths) writeFile(root, path, 'changed\n');
    commit(root);

    expect(detect(root, base).output).toContain(`lightweight=${expected}\n`);
  });

  it('keeps full CI for an empty diff', () => {
    const { root, base } = createRepository();

    expect(detect(root, base).output).toContain('lightweight=false\n');
  });

  it('selects lightweight CI for a docs-only branch after main advances on code', () => {
    const { root, base } = createRepository();
    writeFile(root, 'packages/core/src/index.ts', 'export {};\n');
    commit(root);
    const main = runGit(root, 'rev-parse', 'HEAD');
    runGit(root, 'checkout', '--quiet', '--detach', base);
    writeFile(root, 'docs/guide.md', 'guide\n');
    commit(root);

    expect(detect(root, main).output).toBe('lightweight=true\n');
  });

  it('keeps full CI for a mixed branch after main advances on code', () => {
    const { root, base } = createRepository();
    writeFile(root, 'packages/core/src/index.ts', 'export {};\n');
    commit(root);
    const main = runGit(root, 'rev-parse', 'HEAD');
    runGit(root, 'checkout', '--quiet', '--detach', base);
    writeFile(root, 'docs/guide.md', 'guide\n');
    writeFile(root, 'packages/react/src/index.ts', 'export {};\n');
    commit(root);

    expect(detect(root, main).output).toBe('lightweight=false\n');
  });

  it('fails without output when the revisions have no merge base', () => {
    const { root, base } = createRepository();
    runGit(root, 'checkout', '--quiet', '--orphan', 'unrelated');
    runGit(root, 'rm', '-rf', '.');
    writeFile(root, 'docs/guide.md', 'guide\n');
    commit(root);

    const result = detect(root, base);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
  });

  it('accepts a deletion inside the allowed paths', () => {
    const { root, base } = createRepository();
    rmSync(join(root, 'README.md'));
    commit(root);

    expect(detect(root, base).output).toContain('lightweight=true\n');
  });

  it('checks both sides of a rename across the boundary', () => {
    const { root, base } = createRepository();
    mkdirSync(join(root, 'packages/core'), { recursive: true });
    execFileSync('mv', ['README.md', 'packages/core/README.md'], { cwd: root });
    commit(root);

    expect(detect(root, base).output).toContain('lightweight=false\n');
  });

  it('accepts a rename within the allowed paths', () => {
    const { root, base } = createRepository();
    mkdirSync(join(root, 'docs'), { recursive: true });
    execFileSync('mv', ['README.md', 'docs/README.md'], { cwd: root });
    commit(root);

    expect(detect(root, base).output).toContain('lightweight=true\n');
  });

  it('keeps full CI when a rename moves an outside path into docs', () => {
    const { root } = createRepository();
    writeFile(root, 'packages/core/README.md', 'package\n');
    commit(root);
    const base = runGit(root, 'rev-parse', 'HEAD');
    mkdirSync(join(root, 'docs'), { recursive: true });
    runGit(root, 'mv', 'packages/core/README.md', 'docs/core.md');
    commit(root);

    expect(detect(root, base).output).toBe('lightweight=false\n');
  });

  it('keeps full CI when an outside path is deleted', () => {
    const { root } = createRepository();
    writeFile(root, 'package.json', '{}\n');
    commit(root);
    const base = runGit(root, 'rev-parse', 'HEAD');
    rmSync(join(root, 'package.json'));
    commit(root);

    expect(detect(root, base).output).toContain('lightweight=false\n');
  });

  it('fails when Git cannot compare the revisions', () => {
    const { root } = createRepository();

    const result = detect(root, 'missing-revision');
    expect(result.status).not.toBe(0);
    expect(result.output).toBe('');
  });
});

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'fast-link-ci-'));
  fixtures.push(root);
  runGit(root, 'init', '--quiet');
  runGit(root, 'config', 'user.email', 'fast-link@example.com');
  runGit(root, 'config', 'user.name', 'Fast Link test');
  runGit(root, 'config', 'commit.gpgsign', 'false');
  writeFile(root, 'README.md', 'initial\n');
  commit(root);
  return { root, base: runGit(root, 'rev-parse', 'HEAD') };
}

function writeFile(root, path, contents) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function commit(root) {
  runGit(root, 'add', '-A');
  runGit(root, 'commit', '--quiet', '--allow-empty', '-m', 'change');
}

function runGit(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function detect(root, base) {
  const outputPath = join(root, 'output');
  const result = spawnSync('bash', [script], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PR_BASE: base,
      PR_HEAD: runGit(root, 'rev-parse', 'HEAD'),
      GITHUB_OUTPUT: outputPath,
      RUNNER_TEMP: root,
    },
  });
  return {
    status: result.status,
    output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
  };
}
