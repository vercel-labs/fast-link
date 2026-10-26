import { fileURLToPath } from 'node:url';

const fixture = vi.hoisted(() => ({ path: '', appended: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync(path, options) {
      const content = actual.readFileSync(path, options);
      return path === fixture.path ? content + fixture.appended : content;
    },
  };
});

// Exercise the CLI against the real README plus one in-memory published block.
// Unsupported fences must fail before compilation can silently omit the block.
it.each([
  ['trailing whitespace', '```tsx '],
  ['tilde fence', '~~~ts'],
  ['four backticks', '````ts'],
  ['indented fence', '  ```tsx'],
])('rejects an untracked example using %s', async (_, opening) => {
  fixture.path = fileURLToPath(new URL('../../README.md', import.meta.url));
  fixture.appended = `\n${opening}\nconst invalid: number = 'bad';\n${opening.trim().replace(/tsx?.*/, '')}\n`;
  vi.resetModules();
  await expect(import('./check-examples.mjs')).rejects.toThrow(
    'Use plain triple-backtick ts/tsx fences',
  );
});
