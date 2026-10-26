import {
  compareSemanticVersions,
  isSemanticVersion,
} from './semantic-version.mjs';

it.each(['1.2.3', '1.2.3-alpha.1+build.001'])(
  'accepts unprefixed versions without imposing stable-release policy: %s',
  (version) => {
    expect(isSemanticVersion(version)).toBe(true);
  },
);

it.each([undefined, 123, '', 'v1.2.3', '=1.2.3', ' 1.2.3', '1.2.3 '])(
  'rejects non-string, empty, prefixed, or padded input: %s',
  (version) => {
    expect(isSemanticVersion(version)).toBe(false);
  },
);

it.each([
  ['invalid', '1.2.3'],
  ['1.2.3', 'invalid'],
])('rejects comparisons with invalid input %s / %s', (left, right) => {
  expect(() => compareSemanticVersions(left, right)).toThrow(
    'Cannot compare invalid semantic versions',
  );
});
