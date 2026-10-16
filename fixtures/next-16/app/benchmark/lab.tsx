'use client';

import { createFastLink } from '@fast-link/core';
import { FastLink, FastLinkRegion } from '@fast-link/next';
import { useFastLink } from '@fast-link/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';

type Variant = 'bare' | 'core' | 'plain' | 'react' | 'next' | 'fast' | 'region';
type Metric = { unit: 'us/op' | 'ms'; value: number; correct: boolean };
type List = {
  variant: Variant;
  count: number;
  version: number;
  navigation: boolean;
};
type Navigation = {
  start: number;
  release: number;
  clicks: number;
  prevented: number;
  accepted: number;
  suppressed: number;
};
type Lab = {
  micro: (variant: 'bare' | 'core') => Record<string, Metric>;
  lifecycle: (variant: Variant, count: number) => Record<string, Metric>;
  interaction: (variant: 'plain' | 'react') => Record<string, Metric>;
  navigation: (variant: 'next' | 'fast' | 'region') => void;
  prefetch: () => void;
  events: Navigation;
};

declare global {
  interface Window {
    benchmark: Lab;
    benchmarkDestination?: { text: string; committed: number };
  }
}

const iterations = 1000;
const warmup = 100;
let navigations = 0;
let updatedNavigations = 0;
let suppressedClicks = 0;
const navigate = () => {
  navigations++;
};
const navigateUpdated = () => {
  updatedNavigations++;
};

function ReactAnchor({ version }: { version: number }) {
  const callback = version ? navigateUpdated : navigate;
  const bindings = useFastLink<HTMLAnchorElement>({
    navigate: callback,
  });
  return (
    <a
      href={`/docs/benchmark/target?v=${version}`}
      {...bindings}
      onClick={(event) => {
        if (event.defaultPrevented) suppressedClicks++;
        event.preventDefault();
      }}
    >
      Link {version}
    </a>
  );
}

function PlainAnchor({ version }: { version: number }) {
  const callback = version ? navigateUpdated : navigate;
  return (
    <a
      href={`/docs/benchmark/target?v=${version}`}
      onPointerDown={(event) => {
        if (
          event.button === 0 &&
          event.isPrimary &&
          event.pointerType === 'mouse'
        )
          callback();
      }}
      onClick={(event) => event.preventDefault()}
    >
      Link {version}
    </a>
  );
}

function Links({ variant, count, version, navigation }: List) {
  const children = Array.from({ length: count }, (_, index) => {
    if (variant === 'plain')
      return <PlainAnchor key={index} version={version} />;
    if (variant === 'react')
      return <ReactAnchor key={index} version={version} />;
    const props = {
      href: navigation ? '/benchmark/target' : `/benchmark/target?v=${version}`,
      prefetch: false,
      children: `Link ${version}`,
      onClick: (event: { defaultPrevented: boolean }) => {
        if (event.defaultPrevented) window.benchmark.events.suppressed++;
      },
    };
    if (variant === 'fast')
      return (
        <FastLink
          key={index}
          {...props}
          onFastNavigate={() => window.benchmark.events.accepted++}
        />
      );
    return (
      <Link
        key={index}
        onClick={props.onClick}
        href={
          navigation ? '/benchmark/target' : `/benchmark/target?v=${version}`
        }
        prefetch={false}
      >
        Link {version}
      </Link>
    );
  });
  // All Next variants have the same wrapper and anchor structure.
  if (variant === 'region')
    return (
      <FastLinkRegion
        basePath="/docs"
        onFastNavigate={() => window.benchmark.events.accepted++}
      >
        {children}
      </FastLinkRegion>
    );
  return <div style={{ display: 'contents' }}>{children}</div>;
}

function press(pointerType = 'mouse') {
  return new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    isPrimary: true,
    pointerType,
  });
}
function click() {
  return new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
}

function interactions(
  anchor: HTMLAnchorElement,
  fast: boolean,
  react = false,
): Record<string, Metric> {
  const measure = (ignored: boolean) => {
    const events = Array.from({ length: iterations + warmup }, () => ({
      down: press(ignored ? 'touch' : 'mouse'),
      up: click(),
    }));
    navigations = 0;
    for (const { down, up } of events.slice(0, warmup)) {
      anchor.dispatchEvent(down);
      if (!ignored) anchor.dispatchEvent(up);
    }
    navigations = 0;
    suppressedClicks = 0;
    let prevented = 0;
    const start = performance.now();
    for (const { down, up } of events.slice(warmup)) {
      anchor.dispatchEvent(down);
      if (!ignored) anchor.dispatchEvent(up);
    }
    const elapsed = performance.now() - start;
    for (const { up } of events.slice(warmup))
      if (up.defaultPrevented) prevented++;
    const correct =
      navigations === (ignored ? 0 : iterations) &&
      (ignored || !fast || prevented === iterations) &&
      (ignored || !react || suppressedClicks === iterations);
    return {
      value: (elapsed * 1000) / iterations,
      unit: 'us/op' as const,
      correct,
    };
  };
  return { accepted: measure(false), ignored: measure(true) };
}

export function BenchmarkLab(): JSX.Element {
  const router = useRouter();
  const [list, setList] = useState<List | null>(null);
  useLayoutEffect(() => {
    const area = document.querySelector<HTMLElement>('[data-benchmark-area]');
    if (!area) throw new Error('Missing benchmark area');
    const render = (value: List | null) => flushSync(() => setList(value));
    const events: Navigation = {
      start: 0,
      release: 0,
      clicks: 0,
      prevented: 0,
      accepted: 0,
      suppressed: 0,
    };
    const onDown = () => {
      events.start = performance.now();
    };
    const onUp = () => {
      events.release = performance.now();
    };
    const onClick = (event: MouseEvent) => {
      events.clicks++;
      if (event.defaultPrevented) events.prevented++;
    };
    area.addEventListener('pointerdown', onDown, true);
    area.addEventListener('pointerup', onUp, true);
    document.addEventListener('click', onClick);
    window.benchmark = {
      events,
      prefetch: () => router.prefetch('/benchmark/target'),
      navigation: (variant) =>
        render({ variant, count: 1, version: 0, navigation: true }),
      micro: (variant) => {
        const anchor = document.createElement('a');
        anchor.href = '/docs/benchmark/target';
        area.append(anchor);
        const bareDown = (event: PointerEvent) => {
          if (event.pointerType === 'mouse') navigate();
        };
        const bareClick = (event: MouseEvent) => event.preventDefault();
        const controller =
          variant === 'core' ? createFastLink(anchor, { navigate }) : null;
        if (!controller) {
          anchor.addEventListener('pointerdown', bareDown);
          anchor.addEventListener('click', bareClick);
        }
        const result = interactions(anchor, true);
        controller?.destroy();
        anchor.removeEventListener('pointerdown', bareDown);
        anchor.removeEventListener('click', bareClick);
        navigations = 0;
        anchor.dispatchEvent(press());
        result.accepted.correct &&= navigations === 0;
        anchor.remove();
        return result;
      },
      interaction: (variant) => {
        render({ variant, count: 1, version: 0, navigation: false });
        const anchor = area.querySelector('a');
        if (!anchor) throw new Error('Missing benchmark anchor');
        const result = interactions(
          anchor,
          variant === 'react',
          variant === 'react',
        );
        render(null);
        navigations = 0;
        anchor.dispatchEvent(press());
        result.accepted.correct &&= navigations === 0;
        return result;
      },
      lifecycle: (variant, count) => {
        const timed = (operation: () => void): Metric => {
          const start = performance.now();
          operation();
          return {
            unit: 'ms',
            value: performance.now() - start,
            correct: true,
          };
        };
        const mount = timed(() =>
          render({ variant, count, version: 0, navigation: false }),
        );
        mount.correct = area.querySelectorAll('a').length === count;
        const update = timed(() =>
          render({ variant, count, version: 1, navigation: false }),
        );
        update.correct = [...area.querySelectorAll('a')].every(
          (a) => a.textContent === 'Link 1' && a.search === '?v=1',
        );
        const anchor = area.querySelector('a');
        if (!anchor) throw new Error('Missing benchmark anchor');
        if (variant === 'plain' || variant === 'react') {
          updatedNavigations = 0;
          anchor.dispatchEvent(press());
          anchor.dispatchEvent(click());
          update.correct &&= updatedNavigations === 1;
        }
        const unmount = timed(() => render(null));
        updatedNavigations = 0;
        const acceptedBefore = events.accepted;
        anchor.dispatchEvent(press());
        unmount.correct =
          area.querySelectorAll('a').length === 0 &&
          updatedNavigations === 0 &&
          events.accepted === acceptedBefore;
        return { mount, update, unmount };
      },
    };
    return () => {
      area.removeEventListener('pointerdown', onDown, true);
      area.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('click', onClick);
    };
  }, [router]);
  return <div data-benchmark-area>{list ? <Links {...list} /> : null}</div>;
}
