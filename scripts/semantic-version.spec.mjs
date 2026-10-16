import {
  compareSemanticVersions,
  isSemanticVersion,
} from './semantic-version.mjs';

it.each([
  '0.0.0',
  '1.2.3-alpha.1',
  '1.2.3-0',
  '1.2.3+build.001',
  '9007199254740991.0.0',
])('accepts semantic version %s', (version) => {
  expect(isSemanticVersion(version)).toBe(true);
});

it.each([
  undefined,
  123,
  '',
  'v1.2.3',
  '1.2',
  '01.2.3',
  '1.2.3-01',
  '1.2.3-alpha..1',
  '1.2.3+',
  '9007199254740992.0.0',
  `1.2.3+${'a'.repeat(251)}`,
])('rejects invalid semantic version %s', (version) => {
  expect(isSemanticVersion(version)).toBe(false);
});

it.each([
  ['1.2.3', '1.2.3', 0],
  ['1.2.3+one', '1.2.3+two', 0],
  ['1.2.3-alpha+one', '1.2.3-alpha+two', 0],
  ['2.0.0', '1.99.99', 1],
  ['1.10.0', '1.9.99', 1],
  ['1.2.10', '1.2.9', 1],
  ['1.2.3-alpha', '1.2.3', -1],
  ['1.2.3-alpha', '1.2.3-alpha.1', -1],
  ['1.2.3-alpha.2', '1.2.3-alpha.10', -1],
  ['1.2.3-1', '1.2.3-alpha', -1],
  ['1.2.3-beta', '1.2.3-rc', -1],
])('orders %s relative to %s', (left, right, order) => {
  expect(compareSemanticVersions(left, right)).toBe(order);
  expect(compareSemanticVersions(right, left)).toBe(order === 0 ? 0 : -order);
});

it.each([
  ['invalid', '1.2.3'],
  ['1.2.3', 'invalid'],
])('rejects comparisons with invalid input %s / %s', (left, right) => {
  expect(() => compareSemanticVersions(left, right)).toThrow(
    'Cannot compare invalid semantic versions',
  );
});
