import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function verifyPackedPackage(manifest, expected) {
  if (
    manifest.name !== expected.name ||
    manifest.version !== expected.version
  ) {
    throw new Error(
      `Packed package changed: expected ${expected.name}@${expected.version}, received ${manifest.name}@${manifest.version}`,
    );
  }
  return `${manifest.name}@${manifest.version}`;
}

function run() {
  const verified = verifyPackedPackage(JSON.parse(readFileSync(0, 'utf8')), {
    name: process.env.EXPECTED_PACKAGE_NAME,
    version: process.env.EXPECTED_PACKAGE_VERSION,
  });
  console.log(`Packed package verified: ${verified}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
