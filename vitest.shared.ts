import type { CoverageV8Options, ProjectConfig } from 'vitest/node';

export const coverage = {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.test.{ts,tsx}', 'src/testing/**'],
  reporter: ['text', 'json-summary'],
} satisfies CoverageV8Options;

export const unit = {
  name: 'unit',
  globals: true,
  environment: 'jsdom',
  environmentOptions: { jsdom: { url: 'https://example.com/' } },
  include: ['src/**/*.test.{ts,tsx}'],
} satisfies ProjectConfig;
