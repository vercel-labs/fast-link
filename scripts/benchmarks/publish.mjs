/* oxlint-disable no-await-in-loop -- GitHub branch updates must be serialized. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureBranch, githubRequest, signedCommit } from './github.mjs';
import { renderTable, updateReadme } from './readme.mjs';
import { validateReport } from './report.mjs';

/** Validates publication inputs before making any GitHub writes. */
function readInputs() {
  const [directory, currentPath, previousPath] = process.argv.slice(2);
  if (!directory || !currentPath)
    throw new Error(
      'Usage: node scripts/benchmarks/publish.mjs RESULTS CURRENT_JSON [PREVIOUS_JSON]',
    );

  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('Expected GITHUB_REPOSITORY');

  return { directory, currentPath, previousPath, repository };
}

/** Encodes raw batches, the release report, and its retry-safe predecessor pointer. */
async function resultFiles(directory, prefix, current, previous) {
  const additions = [];
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    const contents = await readFile(resolve(directory, file));
    additions.push(fileAddition(`${prefix}/${file}`, contents));
  }

  const pointer = {
    revision: current.revision,
    path: `${prefix}/release.json`,
    previousRevision: previous?.revision ?? null,
  };
  additions.push(
    fileAddition(pointer.path, `${JSON.stringify(current, null, 2)}\n`),
  );
  additions.push(
    fileAddition('latest.json', `${JSON.stringify(pointer, null, 2)}\n`),
  );
  return additions;
}

/** Encodes file content in the format required by createCommitOnBranch. */
function fileAddition(path, contents) {
  return { path, contents: Buffer.from(contents).toString('base64') };
}

/** Uses current main prose and retries PR creation without a duplicate README commit. */
async function publishReadme(repository, branch, current, previous, url) {
  const main = githubRequest(`repos/${repository}/git/ref/heads/main`).object
    .sha;
  const mainReadme = githubRequest(
    `repos/${repository}/contents/README.md?ref=${main}`,
  );
  const readme = Buffer.from(mainReadme.content, 'base64').toString();
  const generated = updateReadme(readme, renderTable(current, url));

  if (generated === readme) {
    console.log('README unchanged; no PR needed.');
    return;
  }

  const parent = ensureBranch(repository, branch, main);
  const existingReadme = githubRequest(
    `repos/${repository}/contents/README.md?ref=${branch}`,
  );
  if (Buffer.from(existingReadme.content, 'base64').toString() !== generated)
    await signedCommit(
      repository,
      branch,
      parent,
      [
        {
          path: 'README.md',
          contents: Buffer.from(generated).toString('base64'),
        },
      ],
      'docs: update release benchmarks',
    );

  openReadmePr(repository, branch, previous, url, current.conditions.holdMs);
}

/** Reuses an open PR after a partial publication failure. */
function openReadmePr(repository, branch, previous, url, holdMs) {
  const prs = githubRequest(
    `repos/${repository}/pulls?state=open&head=${repository.split('/')[0]}:${branch}&base=main`,
  );
  if (prs.length) {
    console.log(`Updated ${prs[0].html_url}`);
    return;
  }

  const pr = githubRequest(`repos/${repository}/pulls`, {
    head: branch,
    base: 'main',
    title: 'docs: update release benchmarks',
    body: [
      'Updates the README from verified production-browser measurements for the released packages.',
      previous
        ? 'The previous measured release was remeasured on the same runner; its samples are saved with these results.'
        : 'This is the first measured release.',
      '',
      `[Raw results](${url}). Navigation uses a controlled ${holdMs} ms mouse hold; the numbers do not establish typical-user gains.`,
    ].join('\n'),
  });
  console.log(pr.html_url);
}

/** Saves durable results before opening or updating their generated README PR. */
async function publish() {
  const { directory, currentPath, previousPath, repository } = readInputs();
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const previous = previousPath
    ? JSON.parse(await readFile(previousPath, 'utf8'))
    : undefined;
  validateReport(current);
  if (previous) validateReport(previous);
  if (current.errors?.length || current.conditions?.case !== 'all')
    throw new Error('Publication requires a complete successful run');

  const revision = current.revision;
  const resultsBranch = 'benchmark-results';
  const branch = `runewolf/benchmark-readme-${revision.slice(0, 12)}`;
  const prefix = `results/${revision}`;
  const additions = await resultFiles(directory, prefix, current, previous);

  const resultParent = ensureBranch(repository, resultsBranch, revision);
  await signedCommit(
    repository,
    resultsBranch,
    resultParent,
    additions,
    'chore: record release benchmark results',
  );

  const url = `https://github.com/${repository}/blob/${resultsBranch}/${prefix}/release.json`;
  await publishReadme(repository, branch, current, previous, url);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await publish();
