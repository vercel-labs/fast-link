import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const versions = ['next-15', 'next-16'];
const sources = ['client-links.tsx', 'policy-links.tsx'];
const next16Start = '/* @next-16-only:start */';
const next16End = '/* @next-16-only:end */';
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * Generates Next 15 and 16 fixtures from the shared navigation sources.
 *
 * - `write` creates missing outputs and replaces stale ones.
 * - `check` leaves files unchanged and throws with stale paths and the
 *   regeneration command.
 * - Invalid modes, malformed Next 16 markers, and filesystem errors throw.
 *
 * @param {object} [options]
 * @param {string} [options.root] Repository root, defaulting to this script's repo.
 * @param {'write' | 'check'} [options.mode='write'] Whether to write or check outputs.
 * @returns {void}
 */
export function syncNextFixtures({
  root = repositoryRoot,
  mode = 'write',
} = {}) {
  if (!['check', 'write'].includes(mode)) {
    throw new TypeError(`Invalid fixture sync mode: ${mode}`);
  }

  const stale = [];
  for (const sourceName of sources) {
    const sourcePath = join(root, 'fixtures', 'next-shared', 'app', sourceName);
    const source = readFileSync(sourcePath, 'utf8');

    for (const version of versions) {
      const outputPath = join(root, 'fixtures', version, 'app', sourceName);
      const output = renderFixture({ root, source, sourcePath, version });
      const current = existsSync(outputPath)
        ? readFileSync(outputPath, 'utf8')
        : null;
      if (current === output) continue;

      if (mode === 'check') {
        stale.push(relative(root, outputPath));
        continue;
      }

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `Generated Next fixtures are stale:\n${stale
        .map((path) => `- ${path}`)
        .join('\n')}\nRun \`pnpm fixtures:generate\` to update them.`,
    );
  }
}

function renderFixture({ root, source, sourcePath, version }) {
  const lines = [];
  let next16Only = false;

  for (const line of source.split('\n')) {
    if (line.includes(next16Start)) {
      if (next16Only) throw invalidMarkers(sourcePath);
      next16Only = true;
      continue;
    }
    if (line.includes(next16End)) {
      if (!next16Only) throw invalidMarkers(sourcePath);
      next16Only = false;
      continue;
    }
    if (!next16Only || version === 'next-16') lines.push(line);
  }

  if (next16Only) throw invalidMarkers(sourcePath);

  const sourceLabel = relative(root, sourcePath);
  return `// Generated from ${sourceLabel}.\n// Run \`pnpm fixtures:generate\` after editing the source.\n\n${lines.join('\n')}`;
}

function invalidMarkers(sourcePath) {
  return new Error(`Invalid Next 16 markers in ${sourcePath}`);
}

const invokedPath = process.argv[1] && resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--check') || args.length > 1) {
    console.error('Usage: node scripts/generate-next-fixtures.mjs [--check]');
    process.exitCode = 1;
  } else {
    try {
      syncNextFixtures({ mode: args[0] === '--check' ? 'check' : 'write' });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  }
}
