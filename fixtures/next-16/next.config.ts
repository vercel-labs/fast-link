import type { NextConfig } from 'next';

const config: NextConfig = {
  basePath: '/docs',
  experimental: { prepareNavigation: true },
};

export default config;
