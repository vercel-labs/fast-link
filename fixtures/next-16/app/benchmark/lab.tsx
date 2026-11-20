'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLayoutEffect, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';

import {
  api,
  BenchmarkFastLink,
  BenchmarkRegion,
  bindCore,
  supportedModes,
  useAnchorBinding,
  type Mode,
} from './bindings';

// Browser protocol consumed by scripts/benchmarks/measure.mjs and navigation.mjs.
// Fast Link variants run in an explicit mode; `next` and `plain` have none.

type Variant = 'plain' | 'react' | 'next' | 'fast' | 'region';
type Metric = { unit: 'us/op' | 'ms'; value: number; correct: boolean };
type InteractionWorkload = { interactions: number; warmup: number };
type List = {
  variant: Variant;
  mode: Mode;
  count: number;
  version: number;
  navigation: boolean;
  prefetch: boolean;
  // Navigation destination; defaults to the static target.
  destination?: string;
  // Changes on every render request so an unchanged list still rerenders.
  render: number;
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
  api: string;
  modes: readonly Mode[];
  preparation: boolean;
  micro: (
    variant: 'bare' | 'core',
    mode: Mode,
    workload: InteractionWorkload,
  ) => Record<string, Metric>;
  lifecycle: (
    variant: Variant,
    mode: Mode,
    count: number,
  ) => Record<string, Metric>;
  modeSwitch: (
    variant: 'fast' | 'region',
    modes: readonly Mode[],
    count: number,
  ) => Record<string, Metric>;
  interaction: (
    variant: 'plain' | 'react',
    mode: Mode,
    workload: InteractionWorkload,
  ) => Record<string, Metric>;
  navigation: (
    variant: 'next' | 'fast' | 'region',
    mode: Mode,
    prefetch: boolean,
    destination?: string,
  ) => void;
  prefetch: (destination?: string) => void;
  events: Navigation;
};

declare global {
  interface Window {
    benchmark: Lab;
    benchmarkDestination?: { text: string; committed: number };
  }
}

const TARGET = '/benchmark/target';

let navigations = 0;
let updatedNavigations = 0;
let suppressedClicks = 0;
let renders = 0;
const navigate = () => {
  navigations++;
};
const navigateUpdated = () => {
  updatedNavigations++;
};

// Rendered variants share content, destination, and wrapper structure.

function ReactAnchor({ version, mode }: { version: number; mode: Mode }) {
  const callback = version ? navigateUpdated : navigate;
  const binding = useAnchorBinding(mode, callback);
  return (
    <a
      href={`/docs/benchmark/target?v=${version}`}
      ref={binding.ref}
      onClickCapture={binding.onClickCapture}
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

/** Counts link clicks that a Fast Link binding prevented before `onClick`. */
function countSuppressed(event: { defaultPrevented: boolean }) {
  if (event.defaultPrevented) window.benchmark.events.suppressed++;
}

function Links({
  variant,
  mode,
  count,
  version,
  navigation,
  prefetch,
  destination = TARGET,
}: List) {
  renders++;
  const href = navigation ? destination : `${TARGET}?v=${version}`;
  // `undefined` keeps Next Link's default prefetch for the prefetch cache case.
  const prefetchProp = prefetch ? undefined : false;
  const children = Array.from({ length: count }, (_, index) => {
    if (variant === 'plain')
      return <PlainAnchor key={index} version={version} />;
    if (variant === 'react')
      return <ReactAnchor key={index} version={version} mode={mode} />;
    if (variant === 'fast')
      return (
        <BenchmarkFastLink
          key={index}
          href={href}
          prefetch={prefetchProp}
          onClick={countSuppressed}
          mode={mode}
          onFastNavigate={() => window.benchmark.events.accepted++}
        >
          Link {version}
        </BenchmarkFastLink>
      );
    return (
      <Link
        key={index}
        onClick={countSuppressed}
        href={href}
        prefetch={prefetchProp}
      >
        Link {version}
      </Link>
    );
  });
  // All Next variants have the same wrapper and anchor structure.
  if (variant === 'region')
    return (
      <BenchmarkRegion
        basePath="/docs"
        mode={mode}
        onFastNavigate={() => window.benchmark.events.accepted++}
      >
        {children}
      </BenchmarkRegion>
    );
  return <div style={{ display: 'contents' }}>{children}</div>;
}

// Synthetic interaction workloads.

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

function bareDown(event: PointerEvent) {
  if (event.pointerType === 'mouse') navigate();
}

function bareClick(event: MouseEvent) {
  event.preventDefault();
}

/** Whether an accepted press/click pair navigates and prevents its click. */
function isAccelerated(
  variant: 'bare' | 'core' | 'plain' | 'react',
  mode: Mode,
) {
  return variant === 'bare' || variant === 'plain' || mode !== 'native';
}

/**
 * Excludes event construction and warmup from the timed dispatch loop.
 * `prevented` counts clicks the measured binding prevented before they reached
 * the caller's last handler; plain anchors have no binding to check.
 */
function interactions(
  anchor: HTMLAnchorElement,
  { interactions: iterations, warmup }: InteractionWorkload,
  accelerated: boolean,
  prevented: (() => number) | null,
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
    const preventedBefore = prevented?.() ?? 0;

    const start = performance.now();
    for (const { down, up } of events.slice(warmup)) {
      anchor.dispatchEvent(down);
      if (!ignored) anchor.dispatchEvent(up);
    }
    const elapsed = performance.now() - start;

    const expected = !ignored && accelerated ? iterations : 0;
    const correct =
      navigations === expected &&
      (ignored || !prevented || prevented() - preventedBefore === expected);
    return {
      value: (elapsed * 1000) / iterations,
      unit: 'us/op' as const,
      correct,
    };
  };
  return { accepted: measure(false), ignored: measure(true) };
}

// Scenario execution and correctness checks.

type RenderList = (value: Omit<List, 'render'> | null) => void;

/** Dispatches a press/click pair to a removed anchor; returns whether nothing navigated. */
function isDetachedInert(anchor: HTMLAnchorElement, before: () => number) {
  const start = before();
  anchor.addEventListener('click', bareClick, { once: true });
  anchor.dispatchEvent(press());
  anchor.dispatchEvent(click());
  anchor.removeEventListener('click', bareClick);
  return before() === start;
}

/** Measures core dispatch and verifies retained anchors stop navigating after destroy. */
function measureCore(
  area: HTMLElement,
  variant: 'bare' | 'core',
  mode: Mode,
  workload: InteractionWorkload,
): Record<string, Metric> {
  const anchor = document.createElement('a');
  anchor.href = '/docs/benchmark/target';
  area.append(anchor);
  let cleanup = () => {
    anchor.removeEventListener('pointerdown', bareDown);
    anchor.removeEventListener('click', bareClick);
  };
  if (variant === 'core') cleanup = bindCore(anchor, mode, navigate);
  else {
    anchor.addEventListener('pointerdown', bareDown);
    anchor.addEventListener('click', bareClick);
  }
  // Registered last, so it observes the measured variant's prevention and
  // keeps a native-mode click from following the link.
  let prevented = 0;
  const lastClick = (event: MouseEvent) => {
    if (event.defaultPrevented) prevented++;
    event.preventDefault();
  };
  anchor.addEventListener('click', lastClick);

  const result = interactions(
    anchor,
    workload,
    isAccelerated(variant, mode),
    () => prevented,
  );

  cleanup();
  anchor.removeEventListener('click', lastClick);
  navigations = 0;
  result.accepted.correct &&= isDetachedInert(anchor, () => navigations);
  anchor.remove();

  return result;
}

/** Measures React dispatch and verifies ref cleanup after a synchronous unmount. */
function measureReactInteraction(
  area: HTMLElement,
  render: RenderList,
  variant: 'plain' | 'react',
  mode: Mode,
  workload: InteractionWorkload,
): Record<string, Metric> {
  render({
    variant,
    mode,
    count: 1,
    version: 0,
    navigation: false,
    prefetch: false,
  });

  const anchor = area.querySelector('a');
  if (!anchor) throw new Error('Missing benchmark anchor');

  const result = interactions(
    anchor,
    workload,
    isAccelerated(variant, mode),
    variant === 'react' ? () => suppressedClicks : null,
  );

  render(null);
  navigations = 0;
  result.accepted.correct &&= isDetachedInert(anchor, () => navigations);

  return result;
}

/**
 * Times synchronous mount, an unchanged rerender, changed hrefs/labels, and
 * cleanup; checks run outside timing.
 */
function measureLifecycle(
  area: HTMLElement,
  render: RenderList,
  events: Navigation,
  variant: Variant,
  mode: Mode,
  count: number,
): Record<string, Metric> {
  const list = { variant, mode, count, navigation: false, prefetch: false };
  const mount = timeCommit(() => render({ ...list, version: 0 }));
  mount.correct = area.querySelectorAll('a').length === count;

  const mounted = [...area.querySelectorAll('a')];
  const rendersBefore = renders;
  const rerender = timeCommit(() => render({ ...list, version: 0 }));
  rerender.correct =
    renders === rendersBefore + 1 &&
    isSameAnchors(area, mounted) &&
    mounted.every((a) => a.search === '?v=0');

  const update = timeCommit(() => render({ ...list, version: 1 }));
  update.correct = [...area.querySelectorAll('a')].every(
    (a) => a.textContent === 'Link 1' && a.search === '?v=1',
  );

  const anchor = area.querySelector('a');
  if (!anchor) throw new Error('Missing benchmark anchor');
  if (variant === 'plain' || variant === 'react') {
    updatedNavigations = 0;
    anchor.dispatchEvent(press());
    anchor.dispatchEvent(click());
    update.correct &&=
      updatedNavigations === (isAccelerated(variant, mode) ? 1 : 0);
  }

  const unmount = timeCommit(() => render(null));
  updatedNavigations = 0;
  const acceptedBefore = events.accepted;
  anchor.dispatchEvent(press());
  unmount.correct =
    area.querySelectorAll('a').length === 0 &&
    updatedNavigations === 0 &&
    events.accepted === acceptedBefore;

  return { mount, rerender, update, unmount };
}

/**
 * Mounts the first mode outside timing, then times each change to the next
 * mode in order, ending on the first again. A mode change keeps every anchor.
 */
function measureModeSwitch(
  area: HTMLElement,
  render: RenderList,
  variant: 'fast' | 'region',
  modes: readonly Mode[],
  count: number,
): Record<string, Metric> {
  const list = {
    variant,
    count,
    version: 0,
    navigation: false,
    prefetch: false,
  };
  render({ ...list, mode: modes[0] });
  const mounted = [...area.querySelectorAll('a')];
  const metrics: Record<string, Metric> = {};
  for (let index = 1; index <= modes.length; index++) {
    const mode = modes[index % modes.length];
    const metric = timeCommit(() => render({ ...list, mode }));
    metric.correct = mounted.length === count && isSameAnchors(area, mounted);
    metrics[mode] = metric;
  }
  render(null);
  return metrics;
}

function isSameAnchors(area: HTMLElement, expected: HTMLAnchorElement[]) {
  const anchors = area.querySelectorAll('a');
  return (
    anchors.length === expected.length &&
    expected.every((anchor, index) => anchors[index] === anchor)
  );
}

/** Times a synchronous operation in milliseconds; assertions run afterward. */
function timeCommit(operation: () => void): Metric {
  const start = performance.now();
  operation();

  return {
    unit: 'ms',
    value: performance.now() - start,
    correct: true,
  };
}

/** Observes real input without changing event propagation; returns listener cleanup. */
function observeNavigation(area: HTMLElement, events: Navigation) {
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

  return () => {
    area.removeEventListener('pointerdown', onDown, true);
    area.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('click', onClick);
  };
}

// React owns rendering; the measurement functions own timing and checks.

/** Exposes browser workloads after hydration and keeps the source links mounted across navigation. */
export function BenchmarkLab(): JSX.Element {
  const router = useRouter();

  const [list, setList] = useState<List | null>(null);
  useLayoutEffect(() => {
    const area = document.querySelector<HTMLElement>('[data-benchmark-area]');
    if (!area) throw new Error('Missing benchmark area');
    let requests = 0;
    const render: RenderList = (value) =>
      flushSync(() => setList(value && { ...value, render: ++requests }));
    const events: Navigation = {
      start: 0,
      release: 0,
      clicks: 0,
      prevented: 0,
      accepted: 0,
      suppressed: 0,
    };
    const stopObserving = observeNavigation(area, events);

    window.benchmark = {
      api,
      modes: supportedModes,
      // Release preparation needs this router method from the pinned runtime.
      preparation:
        typeof (router as { experimental_prepare?: unknown })
          .experimental_prepare === 'function',
      events,
      prefetch: (destination = TARGET) => router.prefetch(destination),
      navigation: (variant, mode, prefetch, destination) =>
        render({
          variant,
          mode,
          count: 1,
          version: 0,
          navigation: true,
          prefetch,
          destination,
        }),
      micro: (variant, mode, workload) =>
        measureCore(area, variant, mode, workload),
      interaction: (variant, mode, workload) =>
        measureReactInteraction(area, render, variant, mode, workload),
      lifecycle: (variant, mode, count) =>
        measureLifecycle(area, render, events, variant, mode, count),
      modeSwitch: (variant, modes, count) =>
        measureModeSwitch(area, render, variant, modes, count),
    };
    return stopObserving;
  }, [router]);

  return <div data-benchmark-area>{list ? <Links {...list} /> : null}</div>;
}
