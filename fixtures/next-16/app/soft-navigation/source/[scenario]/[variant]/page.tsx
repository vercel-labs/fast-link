import { FastLink, FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';
import type { JSX } from 'react';

// Every variant renders the same link to the same destination; only the
// navigation integration differs.
const scenarios = {
  static: { href: '/soft-navigation/destination', prefetch: false },
  prefetched: { href: '/soft-navigation/destination', prefetch: undefined },
  delayed: { href: '/soft-navigation/delayed-destination', prefetch: false },
} as const;

const variants = [
  'next',
  'fast',
  'region',
  'immediate',
  'immediate-region',
] as const;

type Scenario = keyof typeof scenarios;
type Variant = (typeof variants)[number];

export const dynamicParams = false;

export function generateStaticParams(): {
  scenario: Scenario;
  variant: Variant;
}[] {
  return (Object.keys(scenarios) as Scenario[]).flatMap((scenario) =>
    variants.map((variant) => ({ scenario, variant })),
  );
}

export default async function Source({
  params,
}: {
  params: Promise<{ scenario: Scenario; variant: Variant }>;
}): Promise<JSX.Element> {
  const { scenario, variant } = await params;
  const { href, prefetch } = scenarios[scenario];
  const linkProps = {
    href,
    prefetch,
    'data-testid': 'soft-navigation-link',
    children: 'Open destination',
  };
  return (
    <main>
      <h1>Soft navigation source</h1>
      <nav aria-label="Soft navigation">
        {variant === 'next' && <Link {...linkProps} />}
        {variant === 'fast' && <FastLink {...linkProps} />}
        {variant === 'immediate' && (
          <FastLink {...linkProps} mode="immediate" />
        )}
        {variant === 'region' && (
          <FastLinkRegion basePath="/docs">
            <Link {...linkProps} />
          </FastLinkRegion>
        )}
        {variant === 'immediate-region' && (
          <FastLinkRegion basePath="/docs" mode="immediate">
            <Link {...linkProps} />
          </FastLinkRegion>
        )}
      </nav>
    </main>
  );
}
