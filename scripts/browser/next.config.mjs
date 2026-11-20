import { fileURLToPath } from 'node:url';

import { browserConfig } from './config.mjs';

export default {
  ...browserConfig('next'),
  testMatch: ['next.pw.mjs', 'next-contracts.pw.mjs'],
  globalSetup: fileURLToPath(new URL('./next-setup.mjs', import.meta.url)),
};
