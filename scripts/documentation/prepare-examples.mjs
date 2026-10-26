import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { examples } from './examples.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const output = join(root, 'fixtures/documentation/.generated');
const files = new Map();
const inventory = [];
let checked = 0;

for (const { file, blocks, signatures = [], placeholders = {} } of examples) {
  const markdown = readFileSync(join(root, file), 'utf8');
  const matches = [...markdown.matchAll(/^```(tsx?)\n([\s\S]*?)^```/gm)];
  const openings = [
    ...markdown.matchAll(/^ {0,3}(?:`{3,}|~{3,})[\t ]*tsx?(?:[\t ].*)?$/gm),
  ];
  assert.equal(
    matches.length,
    openings.length,
    `Use plain triple-backtick ts/tsx fences without trailing whitespace in ${file}`,
  );
  assert.equal(
    matches.length,
    blocks,
    `Update the snippet inventory for ${file}`,
  );
  for (const [index, match] of matches.entries()) {
    const block = index + 1;
    const line = markdown.slice(0, match.index).split('\n').length + 1;
    const label = `${file}:${line} (block ${block})`;
    if (signatures.includes(block)) {
      inventory.push(
        `${label}: partial API signature, not an integration example`,
      );
      continue;
    }
    const directory = join(output, file, `${block}`);
    const path = join(directory, `example.${match[1]}`);
    files.set(path, match[2]);
    checked += 1;
    for (const [name, content] of Object.entries(placeholders[block] ?? {})) {
      files.set(join(directory, name), content);
    }
    inventory.push(
      `${label}: ${placeholders[block] ? 'application placeholders' : 'standalone'}`,
    );
  }
}

// Validate the complete inventory before replacing generated inputs.
rmSync(output, { recursive: true, force: true });
for (const [path, source] of files) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
}
console.log(inventory.join('\n'));
console.log(
  `Prepared ${checked} integration examples for standard TypeScript checking.`,
);
