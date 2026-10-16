/* oxlint-disable no-await-in-loop -- GitHub branch updates must be serialized. */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderTable, validateReport } from './report.mjs';

const start = '<!-- benchmarks:start -->';
const end = '<!-- benchmarks:end -->';

/** Replaces only the generated README region; identical output stays unchanged. */
export function updateReadme(readme, table) {
  const before = readme.indexOf(start);
  const after = readme.indexOf(end);
  if (before < 0 || after < before)
    throw new Error('Missing README benchmark markers');
  return `${readme.slice(0, before + start.length)}\n${table}\n${readme.slice(after)}`;
}

function api(endpoint, body) {
  return JSON.parse(
    execFileSync(
      'gh',
      ['api', endpoint, ...(body ? ['--method', 'POST', '--input', '-'] : [])],
      { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' },
    ),
  );
}

async function signedCommit(repository, branch, parent, additions, message) {
  // GitHub's createCommitOnBranch signs commits and checks the expected parent.
  const response = api('graphql', {
    query:
      'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid signature { isValid } } } }',
    variables: {
      input: {
        branch: { repositoryNameWithOwner: repository, branchName: branch },
        expectedHeadOid: parent,
        message: { headline: message },
        fileChanges: { additions },
      },
    },
  });
  const commit = response.data?.createCommitOnBranch?.commit;
  if (!commit?.signature?.isValid)
    throw new Error(
      `GitHub did not confirm a signed commit: ${JSON.stringify(response)}`,
    );
  return commit.oid;
}

function ensureBranch(repository, branch, source) {
  const refs = api(`repos/${repository}/git/matching-refs/heads/${branch}`);
  const existing = refs.find((ref) => ref.ref === `refs/heads/${branch}`);
  if (existing) return existing.object.sha;
  api(`repos/${repository}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: source,
  });
  return source;
}

async function publish() {
  const [directory, currentPath, previousPath] = process.argv.slice(2);
  if (!directory || !currentPath)
    throw new Error(
      'Usage: node scripts/benchmarks/publish.mjs RESULTS CURRENT_JSON [PREVIOUS_JSON]',
    );
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('Expected GITHUB_REPOSITORY');
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const previous = previousPath
    ? JSON.parse(await readFile(previousPath, 'utf8'))
    : undefined;
  validateReport(current);
  if (current.errors?.length || current.conditions?.case !== 'all')
    throw new Error('Publication requires a complete successful run');
  const revision = current.revision;
  const resultsBranch = 'benchmark-results';
  const branch = `runewolf/benchmark-readme-${revision.slice(0, 12)}`;
  const prefix = `results/${revision}`;
  const additions = [];
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.json')) continue;
    additions.push({
      path: `${prefix}/${file}`,
      contents: (await readFile(resolve(directory, file))).toString('base64'),
    });
  }
  additions.push({
    path: `${prefix}/release.json`,
    contents: Buffer.from(`${JSON.stringify(current, null, 2)}\n`).toString(
      'base64',
    ),
  });
  additions.push({
    path: 'latest.json',
    contents: Buffer.from(
      `${JSON.stringify({ revision, path: `${prefix}/release.json`, previousRevision: previous?.revision ?? null }, null, 2)}\n`,
    ).toString('base64'),
  });
  const resultParent = ensureBranch(repository, resultsBranch, revision);
  await signedCommit(
    repository,
    resultsBranch,
    resultParent,
    additions,
    'chore: record release benchmark results',
  );
  const url = `https://github.com/${repository}/blob/${resultsBranch}/${prefix}/release.json`;
  const main = api(`repos/${repository}/git/ref/heads/main`).object.sha;
  const mainReadme = api(`repos/${repository}/contents/README.md?ref=${main}`);
  const readme = Buffer.from(mainReadme.content, 'base64').toString();
  const generated = updateReadme(readme, renderTable(current, url, previous));
  if (generated === readme) {
    console.log('README unchanged; no PR needed.');
    return;
  }
  const parent = ensureBranch(repository, branch, main);
  const existingReadme = api(
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
  const prs = api(
    `repos/${repository}/pulls?state=open&head=${repository.split('/')[0]}:${branch}&base=main`,
  );
  if (prs.length) {
    console.log(`Updated ${prs[0].html_url}`);
    return;
  }
  const pr = api(`repos/${repository}/pulls`, {
    head: branch,
    base: 'main',
    title: 'docs: update release benchmarks',
    body: `Readers need results for the released packages. This updates the README from verified production-browser measurements.${previous ? ' The table compares the previous measured release on the same runner.' : ' This is the first measured release.'}\n\n[Raw results](${url}). Navigation uses a controlled 80 ms mouse hold; the numbers do not establish typical-user gains.`,
  });
  console.log(pr.html_url);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await publish();
