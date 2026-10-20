import { readFileSync, readdirSync } from 'node:fs';

import { parse } from 'yaml';

const setup = parse(
  readFileSync(
    new URL(
      '../../.github/actions/setup-workspace/action.yml',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('CI validation workflow', () => {
  it('uses one pinned revision for each external action across workflows and workspace setup', () => {
    const directory = new URL('../../.github/workflows/', import.meta.url);
    const documents = readdirSync(directory).map((name) =>
      parse(readFileSync(new URL(name, directory), 'utf8')),
    );
    const steps = documents.flatMap((document) =>
      Object.values(document.jobs).flatMap((job) => job.steps ?? []),
    );
    const actions = new Map();
    for (const step of [...steps, ...setup.runs.steps]) {
      if (!step.uses || step.uses.startsWith('./')) continue;
      const [name, revision] = step.uses.split('@');
      expect(revision, step.uses).toMatch(/^[a-f0-9]{40}$/);
      if (!actions.has(name)) actions.set(name, new Set());
      actions.get(name).add(revision);
    }
    for (const [name, revisions] of actions) {
      expect([...revisions], name).toHaveLength(1);
    }
  });

  it('installs workspace dependencies after Node and cache setup', () => {
    expect(setup.inputs['node-version'].required).toBe(true);
    expect(setup.runs.using).toBe('composite');
    expect(
      setup.runs.steps.map((step) => step.uses?.split('@')[0] ?? step.run),
    ).toEqual([
      'pnpm/action-setup',
      'actions/setup-node',
      'actions/cache',
      'pnpm install --frozen-lockfile',
    ]);
    const [, node, cache, install] = setup.runs.steps;
    expect(node.with).toEqual({
      'node-version': '${{ inputs.node-version }}',
      cache: 'pnpm',
      'registry-url': '${{ inputs.registry-url }}',
    });
    expect(cache.if).toBe("${{ inputs.turbo-cache == 'true' }}");
    expect(cache.with).toEqual({
      path: '.turbo',
      key: '${{ runner.os }}-turbo-${{ github.job }}-${{ github.sha }}',
      'restore-keys':
        '${{ runner.os }}-turbo-${{ github.job }}-\n${{ runner.os }}-turbo-\n',
    });
    expect(install.shell).toBe('bash');
  });

  it('allows cancellation while failing validation when path detection is unsuccessful', () => {
    const workflow = parse(
      readFileSync(
        new URL('../../.github/workflows/ci.yml', import.meta.url),
        'utf8',
      ),
    );
    const validate = workflow.jobs.validate;

    expect(validate.if).toBe('${{ !cancelled() }}');
    expect(validate.needs).toBe('paths');
    expect(validate.steps[0]).toMatchObject({
      if: "${{ needs.paths.result != 'success' }}",
      run: 'exit 1',
    });
    expect(
      validate.steps.find(
        (step) => step.uses === './.github/actions/setup-workspace',
      ).with,
    ).toEqual({
      'node-version': '24',
      'registry-url': 'https://registry.npmjs.org',
      'turbo-cache': "${{ needs.paths.outputs.lightweight != 'true' }}",
    });
  });
});
