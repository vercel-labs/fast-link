import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const SKILL_DIRECTORY = 'skills/fast-link';

/** Replaces generated package content with the complete canonical skill. */
export function prepareBundledSkill(root, directory) {
  const destination = join(root, directory, SKILL_DIRECTORY);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, SKILL_DIRECTORY), destination, { recursive: true });
}

/** Checks archive membership, exact file bytes, and local Markdown link targets. */
export function verifyBundledSkill({ root, archive, execute }) {
  const source = readSkillFiles(join(root, SKILL_DIRECTORY));
  for (const required of ['SKILL.md', 'agents/openai.yaml']) {
    if (!source.has(required))
      throw new Error(`Missing canonical skill file: ${required}`);
  }
  const prefix = `package/${SKILL_DIRECTORY}/`;
  const packedFiles = String(execute('tar', ['-tf', archive]))
    .split('\n')
    .filter((path) => path.startsWith(prefix) && !path.endsWith('/'))
    .map((path) => path.slice(prefix.length))
    .toSorted();
  if (!isDeepStrictEqual(packedFiles, [...source.keys()].toSorted())) {
    throw new Error(
      `Bundled skill files differ from canonical source: ${archive}`,
    );
  }
  for (const [path, content] of source) {
    const packed = execute('tar', ['-xOf', archive, `${prefix}${path}`]);
    if (!content.equals(Buffer.from(packed))) {
      throw new Error(
        `Bundled skill content differs from canonical source: ${path} in ${archive}`,
      );
    }
    if (path.endsWith('.md'))
      verifyLocalLinks(path, content.toString(), source);
  }
}

function readSkillFiles(directory, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      for (const [name, content] of readSkillFiles(path, relative))
        files.set(name, content);
    } else if (entry.isFile()) {
      files.set(relative, readFileSync(path));
    } else {
      throw new Error(`Skill resources must be regular files: ${path}`);
    }
  }
  return files;
}

function verifyLocalLinks(path, markdown, files) {
  // Inline links/images and reference definitions share the same destination rules.
  const destinations = [
    ...markdown.matchAll(/\]\(\s*(?:<([^>]+)>|([^\s)]+))/g),
    ...markdown.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm),
  ];
  for (const match of destinations) {
    const href = match[1] ?? match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue;
    const target = decodeURIComponent(href.split(/[?#]/)[0]);
    const resolved = posix.join(posix.dirname(path), target);
    if (posix.isAbsolute(target) || !files.has(resolved)) {
      throw new Error(`Broken local skill link: ${path} -> ${href}`);
    }
  }
}
