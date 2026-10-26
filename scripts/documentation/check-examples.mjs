import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { examples } from './examples.mjs';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(join(root, 'packages/next/package.json'));
const ts = require('typescript');
const sources = new Map();
const directories = new Set();
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
    // Virtual files resolve dependencies from Next's workspace node_modules.
    // Their bodies are the actual Markdown blocks; no snippet copies are kept.
    const directory = join(
      root,
      'packages/next/__doc_examples__',
      file,
      `${block}`,
    );
    const path = join(directory, `example.${match[1]}`);
    sources.set(path, match[2]);
    checked += 1;
    for (const [name, content] of Object.entries(placeholders[block] ?? {})) {
      sources.set(join(directory, name), content);
    }
    let parent = directory;
    while (parent !== root) {
      directories.add(parent);
      parent = dirname(parent);
    }
    inventory.push(
      `${label}: ${placeholders[block] ? 'application placeholders' : 'standalone'}`,
    );
  }
}

const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  noEmit: true,
  esModuleInterop: true,
  skipLibCheck: true,
  types: ['react'],
  typeRoots: [join(root, 'packages/next/node_modules/@types')],
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);
const directoryExists = host.directoryExists.bind(host);
const getSourceFile = host.getSourceFile.bind(host);
host.readFile = (path) => sources.get(path) ?? readFile(path);
host.fileExists = (path) => sources.has(path) || fileExists(path);
host.directoryExists = (path) => directories.has(path) || directoryExists(path);
host.getSourceFile = (
  path,
  languageVersion,
  onError,
  shouldCreateNewSourceFile,
) =>
  sources.has(path)
    ? ts.createSourceFile(path, sources.get(path), languageVersion, true)
    : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);

// Resolve public package imports through manifests, and require built declarations.
for (const name of ['core', 'react', 'next']) {
  const resolved = ts.resolveModuleName(
    `@fast-link/${name}`,
    join(root, 'packages/next/__doc_examples__/example.tsx'),
    options,
    host,
  ).resolvedModule;
  assert.equal(
    resolved?.resolvedFileName,
    join(root, `packages/${name}/dist/index.d.ts`),
    `Build @fast-link/${name} before checking published examples`,
  );
}

const program = ts.createProgram([...sources.keys()], options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(inventory.join('\n'));
if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (path) => path,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }),
  );
  process.exitCode = 1;
} else {
  console.log(
    `Passed: ${checked} integration examples against built public exports.`,
  );
}
