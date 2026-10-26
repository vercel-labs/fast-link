import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

describe('release workflow', () => {
  it.each(['ci', 'release'])(
    'verifies one artifact set across the %s consumer matrix',
    (name) => {
      const { jobs } = parse(
        readFileSync(
          new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
          'utf8',
        ),
      );
      expect(jobs['packed-consumers'].needs).toContain('validate');
      expect(jobs['packed-consumers'].strategy.matrix.node).toEqual([
        22, 24, 26,
      ]);
      expect(
        jobs.validate.steps.filter((step) =>
          step.run?.includes('prepare-package-artifacts.mjs'),
        ),
      ).toHaveLength(1);
      expect(
        jobs['packed-consumers'].steps.some((step) =>
          step.uses?.startsWith('actions/download-artifact@'),
        ),
      ).toBe(true);
      expect(
        jobs['packed-consumers'].steps.some((step) =>
          /pnpm install|pnpm .*pack|turbo run build/.test(step.run ?? ''),
        ),
      ).toBe(false);
      expect(
        jobs['packed-consumers'].steps.some(
          (step) => step.uses === './.github/actions/setup-workspace',
        ),
      ).toBe(false);
    },
  );

  it('keeps workspace installation and packing out of the OIDC job', () => {
    const { jobs } = parse(workflow);
    expect(jobs.publish.environment).toBe('release');
    expect(
      jobs.publish.steps.some((step) =>
        /pnpm install|prepare-package-artifacts|turbo run build/.test(
          step.run ?? '',
        ),
      ),
    ).toBe(false);
    expect(
      jobs.publish.steps.some(
        (step) =>
          step.uses?.startsWith('pnpm/action-setup@') ||
          step.uses === './.github/actions/setup-workspace',
      ),
    ).toBe(false);
    expect(
      jobs.publish.steps.some((step) =>
        step.uses?.startsWith('actions/download-artifact@'),
      ),
    ).toBe(true);
  });

  it('runs tag recovery without pnpm setup or workspace installation', () => {
    const release = parse(workflow).jobs.release;
    expect(
      release.steps.some(
        (step) =>
          step.uses?.startsWith('pnpm/action-setup@') ||
          step.uses === './.github/actions/setup-workspace',
      ),
    ).toBe(false);
    expect(release.steps.some((step) => /pnpm/.test(step.run ?? ''))).toBe(
      false,
    );
    expect(
      release.steps.some((step) =>
        step.uses?.startsWith('actions/setup-node@'),
      ),
    ).toBe(true);
  });

  it('reruns CI when a pull request is retargeted to a different base', () => {
    const ci = parse(
      readFileSync(
        new URL('../../.github/workflows/ci.yml', import.meta.url),
        'utf8',
      ),
    );
    // GitHub sends a base-branch retarget as pull_request.edited.
    expect(ci.on.pull_request.types).toContain('edited');
  });
  const workflow = readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const condition =
    "github.ref == 'refs/heads/main' && needs.detect.outputs.has_packages == 'true'";
  it('requires main, publish candidates, and all prerequisite jobs', () => {
    const publish = parse(workflow).jobs.publish;
    expect(publish.if, 'publish condition').toBe(`\${{ ${condition} }}`);
    expect(publish.needs, 'publish dependencies').toEqual(
      expect.arrayContaining([
        'detect',
        'validate',
        'browser',
        'packed-consumers',
      ]),
    );
  });

  it('separates npm publishing permissions from GitHub tag permissions', () => {
    const { permissions, jobs } = parse(workflow);
    expect(permissions).toEqual({ contents: 'read' });
    expect(jobs.publish.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
    expect(jobs.release.permissions).toEqual({ contents: 'write' });
    expect(jobs.release.environment).toBe('release');
    expect(jobs.release.needs).toEqual([
      'detect',
      'validate',
      'browser',
      'packed-consumers',
      'publish',
    ]);
    expect(
      jobs.release.steps.find(
        (step) => step.run === 'node scripts/release/create-package-tags.mjs',
      ).env.GH_TOKEN,
    ).toBe('${{ github.token }}');
    expect(jobs.release.steps[0].with['fetch-depth']).toBe(0);
  });

  it.each([
    ['after successful publication', {}, true],
    ['after failed publication', { publish: 'failure' }, true],
    ['after skipped publication', { publish: 'skipped' }, true],
    ['with failed validation', { validate: 'failure' }, false],
    ['with failed browser checks', { browser: 'failure' }, false],
    ['with failed consumers', { consumers: 'failure' }, false],
    ['with failed detection', { detect: 'failure' }, false],
    ['without allowlisted packages', { allowlisted: 'false' }, false],
    ['off main', { ref: 'refs/heads/other' }, false],
    ['after cancellation', { cancelled: true }, false],
  ])('gates tag recovery %s', (_, overrides, expected) => {
    const state = {
      validate: 'success',
      browser: 'success',
      consumers: 'success',
      detect: 'success',
      publish: 'success',
      allowlisted: 'true',
      ref: 'refs/heads/main',
      cancelled: false,
      ...overrides,
    };
    const releaseCondition = parse(workflow).jobs.release.if.slice(3, -2);
    const evaluate = new Function(
      'github',
      'needs',
      'cancelled',
      `return ${releaseCondition}`,
    );
    const needs = {
      detect: {
        result: state.detect,
        outputs: { has_publishable_packages: state.allowlisted },
      },
      validate: { result: state.validate },
      browser: { result: state.browser },
      publish: { result: state.publish },
      'packed-consumers': { result: state.consumers },
    };
    expect(evaluate({ ref: state.ref }, needs, () => state.cancelled)).toBe(
      expected,
    );
  });
});
