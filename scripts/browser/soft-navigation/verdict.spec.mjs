import {
  classifyRun,
  summarizeIntegration,
  summarizeScenario,
} from './verdict.mjs';

const destinationUrl = 'http://127.0.0.1:3000/docs/soft-navigation/destination';
const cold = { expected: 'cold', matched: true };

describe('classifyRun', () => {
  it.each([
    ['a release run with one push after the click', 'fast', {}, []],
    [
      'a release run that pushes twice',
      'fast',
      { pushes: [150, 160] },
      ['history pushes: 2', 'history delta: 2'],
    ],
    [
      'a release run that pushes before the click',
      'region',
      { pushes: [50] },
      ['history push before acceptance'],
    ],
    [
      'an immediate run whose click lands on destination content',
      'immediate',
      { clickOnLink: false, pushes: [20] },
      [],
    ],
    [
      'a release run whose click misses the link',
      'fast',
      { clickOnLink: false },
      ['trusted clicks: 1 (0 on link)'],
    ],
    [
      'a run that loads the destination as a document',
      'next',
      { documentRequests: 1 },
      ['document request'],
    ],
    [
      'a run whose rendered-link prefetch did not settle',
      'next',
      { cache: { expected: 'prefetched', matched: false } },
      ['cache state'],
    ],
    [
      'a cold release run that prepares before the click',
      'fast',
      { cache: cold, resources: [{ startTime: 2, responseEnd: 9 }] },
      [],
    ],
    [
      'a cold release run without a preparation request',
      'region',
      { cache: cold, resources: [{ startTime: 102, responseEnd: 109 }] },
      ['no preparation request before click'],
    ],
    [
      'a cold baseline run that requests before the click',
      'next',
      { cache: cold, resources: [{ startTime: 2, responseEnd: 9 }] },
      ['destination request before click'],
    ],
    [
      'a run with two soft-navigation entries',
      'next',
      { entries: 2 },
      ['soft-navigation entries: 2'],
    ],
  ])('classifies %s', (_name, variant, overrides, problems) => {
    const result = classifyRun(observation(overrides), {
      variant,
      destinationUrl,
    });
    expect(result.problems).toEqual(problems);
    expect(result.valid).toBe(problems.length === 0);
  });

  it('reports detection only for entries named with the destination', () => {
    const result = classifyRun(
      observation({ entryName: `${destinationUrl}?other` }),
      { variant: 'next', destinationUrl },
    );
    expect(result.detected).toBe(false);
  });
});

describe('summarizeScenario', () => {
  it('leaves release verdicts inconclusive when the baseline is undetected', () => {
    const summary = summarizeScenario([
      ...repeat('next', { detected: false }),
      ...repeat('fast'),
      ...repeat('region'),
    ]);
    expect(summary.release.fast.verdict).toBe('inconclusive');
    expect(summary.release.region.verdict).toBe('inconclusive');
  });

  it('leaves release verdicts inconclusive when the baseline is unstable', () => {
    const summary = summarizeScenario([
      ...repeat('next', {}, [{ detected: false }]),
      ...repeat('fast'),
      ...repeat('region'),
    ]);
    expect(summary.release.fast.verdict).toBe('inconclusive');
  });

  it('judges each release integration separately against a detected baseline', () => {
    const summary = summarizeScenario([
      ...repeat('next'),
      ...repeat('fast'),
      ...repeat('region', {}, [{ detected: false }]),
    ]);
    expect(summary.release.fast.verdict).toBe('pass');
    expect(summary.release.region.verdict).toBe('fail');
  });

  it('fails a detected but invalid release run', () => {
    const summary = summarizeScenario([
      ...repeat('next'),
      ...repeat('fast', {}, [
        { valid: false, problems: ['history pushes: 2'] },
      ]),
    ]);
    expect(summary.release.fast).toMatchObject({
      verdict: 'fail',
      detected: 4,
      problems: ['repetition 1: history pushes: 2'],
    });
  });

  it('discloses immediate detection without affecting release verdicts', () => {
    const summary = summarizeScenario([
      ...repeat('next'),
      ...repeat('fast'),
      ...repeat('immediate', { detected: false }),
    ]);
    expect(summary.release.fast.verdict).toBe('pass');
    expect(summary.immediate.immediate).toMatchObject({
      verdict: 'disclosed',
      detected: 0,
    });
  });
});

describe('summarizeIntegration', () => {
  it.each([
    [['pass', 'pass'], 'pass'],
    [['pass', 'inconclusive'], 'inconclusive'],
    [['inconclusive', 'fail'], 'fail'],
    [[], 'inconclusive'],
  ])('combines %j as %s', (verdicts, expected) => {
    const summaries = verdicts.map((verdict) => ({
      release: { fast: { verdict } },
    }));
    expect(summarizeIntegration(summaries, 'fast')).toBe(expected);
  });
});

// A valid release-style observation: press at 0 ms, click at 100 ms, one push.
function observation({
  clickOnLink = true,
  pushes = [150],
  entries = 1,
  entryName = destinationUrl,
  cache = { matched: true },
  resources = [],
  documentRequests = 0,
} = {}) {
  return {
    cache,
    navigationError: null,
    before: { url: 'source', historyLength: 2 },
    after: { url: destinationUrl, historyLength: 2 + pushes.length },
    documentRequests,
    pageErrors: [],
    resources,
    pageLog: {
      events: [
        { type: 'pointerdown', time: 0, isTrusted: true, onLink: true },
        { type: 'pointerup', time: 100, isTrusted: true, onLink: clickOnLink },
        { type: 'click', time: 100, isTrusted: true, onLink: clickOnLink },
      ],
      navigations: pushes.map((time) => ({
        time,
        navigationType: 'push',
        url: destinationUrl,
      })),
      softNavigations: Array.from({ length: entries }, () => ({
        name: entryName,
        startTime: 100,
      })),
      destination: { time: 160, url: destinationUrl },
    },
  };
}

function repeat(variant, run = {}, overrides = []) {
  return Array.from({ length: 5 }, (_, index) => ({
    variant,
    repetition: index + 1,
    valid: true,
    detected: true,
    problems: [],
    ...run,
    ...overrides[index],
  }));
}
