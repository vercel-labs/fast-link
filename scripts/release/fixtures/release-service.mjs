#!/usr/bin/env node

import { appendFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const root = dirname(dirname(process.argv[1]));
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(
  join(root, 'commands.jsonl'),
  `${JSON.stringify({ command, args })}\n`,
);
const { commit, versions } = JSON.parse(
  readFileSync(join(root, 'release-services.json'), 'utf8'),
);

if (command === 'npm' && args[0] === 'view') {
  if (args[2] === 'versions') console.log(JSON.stringify(versions));
  else if (args[2] === 'gitHead') console.log(JSON.stringify(commit));
  else throw new Error('Unexpected npm view');
} else if (command === 'npm' && args[0] === 'publish') {
  process.exit(0);
} else if (command === 'gh' && args[0] === 'api') {
  console.log(args.includes('POST') ? '{}' : '[]');
} else throw new Error('Unexpected service command');
