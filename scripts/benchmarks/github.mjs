import { execFileSync } from 'node:child_process';

/** Sends a GitHub CLI request; authentication and API failures propagate to the caller. */
export function githubRequest(endpoint, body) {
  return JSON.parse(
    execFileSync(
      'gh',
      ['api', endpoint, ...(body ? ['--method', 'POST', '--input', '-'] : [])],
      { input: body ? JSON.stringify(body) : undefined, encoding: 'utf8' },
    ),
  );
}

/** Commits against an expected parent and rejects unverified GitHub signatures. */
export async function signedCommit(
  repository,
  branch,
  parent,
  additions,
  message,
) {
  // GitHub's createCommitOnBranch signs commits and checks the expected parent.
  const response = githubRequest('graphql', {
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

/** Returns the existing branch head, or creates the branch at the supplied commit. */
export function ensureBranch(repository, branch, source) {
  const refs = githubRequest(
    `repos/${repository}/git/matching-refs/heads/${branch}`,
  );
  const existing = refs.find((ref) => ref.ref === `refs/heads/${branch}`);
  if (existing) return existing.object.sha;
  githubRequest(`repos/${repository}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: source,
  });
  return source;
}
