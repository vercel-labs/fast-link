import { fileURLToPath } from 'node:url';

import { browserConfig } from './config.mjs';

export default {
  ...browserConfig('next'),
  globalSetup: fileURLToPath(new URL('./next-setup.mjs', import.meta.url)),
};
