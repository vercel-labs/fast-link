import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

describe('CI validation workflow', () => {
  it('allows cancellation while failing validation when path detection is unsuccessful', () => {
    const workflow = parse(
      readFileSync(
        new URL('../.github/workflows/ci.yml', import.meta.url),
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
  });
});
