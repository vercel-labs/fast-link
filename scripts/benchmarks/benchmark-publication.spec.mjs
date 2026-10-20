import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scenarioNames } from './report.mjs';

const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'fast-link-publication-'));
  directories.push(directory);
  const revision = 'a'.repeat(40);
  const previousRevision = 'b'.repeat(40);
  const report = {
    schema: 1,
    revision,
    versions: { next: '16.3.6' },
    environment: { browser: 'Chromium' },
    conditions: {
      case: 'all',
      holdMs: 85,
      batches: 5,
      interactions: 1000,
      warmup: 100,
    },
    errors: [],
    metrics: Object.fromEntries(
      scenarioNames().map((name) => [
        name,
        {
          unit: 'ms',
          samples: [10, 10, 10, 10, 10],
          checks: [true, true, true, true, true],
        },
      ]),
    ),
  };
  writeFileSync(join(directory, 'current.json'), JSON.stringify(report));
  writeFileSync(
    join(directory, 'previous.json'),
    JSON.stringify({ ...report, revision: previousRevision }),
  );
  const state = {
    main: 'c'.repeat(40),
    revision,
    previousRevision,
    mainReadme:
      'Current main introduction\n<!-- benchmarks:start -->\nOld table\n<!-- benchmarks:end -->\n',
    branchReadme: '',
    branches: {},
    prAttempts: 0,
    failPrOnce: true,
    commits: [],
    latest: null,
  };
  writeFileSync(join(directory, 'state.json'), JSON.stringify(state));
  // Fake only the external GitHub CLI; run the real publication command.
  writeFileSync(
    join(directory, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.env.FAKE_GITHUB_STATE;
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
const endpoint = process.argv[3];
const body = process.argv.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;
let output;
let failure = false;
if (endpoint.includes('matching-refs')) {
  const branch = endpoint.split('heads/')[1];
  output = state.branches[branch] ? [{ ref: 'refs/heads/' + branch, object: { sha: state.branches[branch] } }] : [];
} else if (endpoint.endsWith('/git/refs')) {
  state.branches[body.ref.replace('refs/heads/', '')] = body.sha;
  output = {};
} else if (endpoint.endsWith('/git/ref/heads/main')) output = { object: { sha: state.main } };
else if (endpoint.includes('/git/trees/')) output = { tree: state.latest ? [{ path: 'latest.json' }] : [] };
else if (endpoint.includes('/contents/latest.json')) output = { content: Buffer.from(JSON.stringify(state.latest)).toString('base64') };
else if (endpoint.includes('/contents/README.md')) output = { content: Buffer.from(endpoint.endsWith('ref=' + state.main) ? state.mainReadme : state.branchReadme).toString('base64') };
else if (endpoint === 'graphql') {
  const input = body.variables.input;
  state.commits.push(input);
  for (const file of input.fileChanges.additions) {
    const content = Buffer.from(file.contents, 'base64').toString();
    if (file.path === 'README.md') state.branchReadme = content;
    if (file.path === 'latest.json') state.latest = JSON.parse(content);
  }
  output = { data: { createCommitOnBranch: { commit: { oid: 'd'.repeat(40), signature: { isValid: true } } } } };
} else if (endpoint.includes('/pulls?')) output = [];
else if (endpoint.endsWith('/pulls')) {
  state.prAttempts++;
  if (state.failPrOnce) { state.failPrOnce = false; failure = true; }
  output = { html_url: 'https://github.com/example/repo/pull/1' };
} else throw new Error('Unexpected GitHub request: ' + endpoint);
fs.writeFileSync(path, JSON.stringify(state));
if (failure) process.exit(1);
process.stdout.write(JSON.stringify(output));
`,
  );
  chmodSync(join(directory, 'gh'), 0o755);
  const execute = (script, args = []) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL(`./${script}.mjs`, import.meta.url)), ...args],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH}`,
          FAKE_GITHUB_STATE: join(directory, 'state.json'),
          GITHUB_REPOSITORY: 'example/repo',
          GITHUB_SHA: revision,
          GITHUB_OUTPUT: join(directory, 'outputs'),
          RUNNER_TEMP: directory,
        },
      },
    );
  return {
    directory,
    execute,
    state: () =>
      JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')),
  };
}

it('retries PR creation after saving results and preserves current main prose and the previous release', () => {
  const { directory, execute, state } = fixture();
  const args = [
    directory,
    join(directory, 'current.json'),
    join(directory, 'previous.json'),
  ];
  expect(execute('publish', args).status).toBe(1);
  expect(state().branchReadme.startsWith('Current main introduction\n')).toBe(
    true,
  );
  expect(state().branchReadme).toContain(
    '<summary>View benchmark comparisons</summary>',
  );
  expect(state().branchReadme).not.toContain('Change from previous release');
  expect(state().branchReadme).toContain('- Mouse hold: **85 ms**');
  expect(state().branchReadme).toContain('Workload (median time)');
  expect(state().branchReadme).not.toContain('Scenario ID');
  expect(state().branchReadme).not.toContain('Tested versions:');
  expect(state().branchReadme).not.toContain('Source commit:');
  expect(execute('baseline').status).toBe(0);
  expect(readFileSync(join(directory, 'outputs'), 'utf8')).toBe(
    `revision=${'b'.repeat(40)}\n`,
  );
  const retry = execute('publish', args);
  expect(retry.status, retry.stderr).toBe(0);
  expect(state().prAttempts).toBe(2);
  expect(
    state().commits.filter((commit) =>
      commit.fileChanges.additions.some((file) => file.path === 'README.md'),
    ),
  ).toHaveLength(1);
});

it('rejects invalid previous-release samples before saving results', () => {
  const { directory, execute, state } = fixture();
  writeFileSync(
    join(directory, 'previous.json'),
    JSON.stringify({ schema: 1 }),
  );

  const result = execute('publish', [
    directory,
    join(directory, 'current.json'),
    join(directory, 'previous.json'),
  ]);

  expect(result.status).toBe(1);
  expect(state().commits).toHaveLength(0);
});

it('recovers a results branch created before its first result commit', () => {
  const { directory, execute, state } = fixture();
  writeFileSync(
    join(directory, 'state.json'),
    JSON.stringify({
      ...state(),
      branches: { 'benchmark-results': 'a'.repeat(40) },
    }),
  );
  const result = execute('baseline');
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(directory, 'outputs'), 'utf8')).toBe('revision=\n');
});

it('rejects stale releases before they can replace the latest results', () => {
  const { directory, execute, state } = fixture();
  writeFileSync(
    join(directory, 'state.json'),
    JSON.stringify({
      ...state(),
      branches: { 'benchmark-results': 'c'.repeat(40) },
      latest: {
        revision: 'c'.repeat(40),
        path: `results/${'c'.repeat(40)}/release.json`,
      },
    }),
  );
  // The Git stub reports that the latest measured release is not an ancestor.
  writeFileSync(
    join(directory, 'git'),
    '#!/bin/sh\n[ "$1" = merge-base ] && [ "$2" = --is-ancestor ] || exit 2\nexit 1\n',
  );
  chmodSync(join(directory, 'git'), 0o755);
  const result = execute('baseline');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('refusing stale publication');
  expect(state().commits).toHaveLength(0);
});
