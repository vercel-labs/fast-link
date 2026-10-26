import semver from 'semver';

/** Validates SemVer without accepting prefixes or surrounding whitespace. */
export function isSemanticVersion(value) {
  return (
    typeof value === 'string' &&
    /^[0-9]/.test(value) &&
    value.trim() === value &&
    semver.valid(value) !== null
  );
}

export function compareSemanticVersions(left, right) {
  if (!isSemanticVersion(left) || !isSemanticVersion(right)) {
    throw new Error(
      `Cannot compare invalid semantic versions: ${String(left)} and ${String(right)}`,
    );
  }
  return semver.compare(left, right);
}
