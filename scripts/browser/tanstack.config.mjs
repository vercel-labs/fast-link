import { browserConfig } from './config.mjs';

export default {
  ...browserConfig('tanstack'),
  webServer: {
    command:
      'pnpm --dir fixtures/tanstack exec vite preview --host 127.0.0.1 --port 4178 --strictPort',
    cwd: new URL('../../', import.meta.url).pathname,
    url: 'http://127.0.0.1:4178/app/',
    reuseExistingServer: false,
  },
  use: {
    ...browserConfig('tanstack').use,
    baseURL: 'http://127.0.0.1:4178',
  },
};
