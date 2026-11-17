import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { createRef, useState, type ReactNode } from 'react';

import {
  FastLink,
  FastLinkRegion,
  useFastLink,
  type FastNavigationPolicy,
} from './index';

// Core owns the input eligibility matrix; these tests exercise actual Router wiring.
function press(anchor: Element, pointerType = 'mouse') {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(anchor, event);
}

async function mount(children: ReactNode, basepath = '/') {
  const root = createRootRoute({
    component: () => (
      <>
        {children}
        <Outlet />
      </>
    ),
  });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>Home page</p>,
  });
  const destination = createRoute({
    getParentRoute: () => root,
    path: '/posts/$postId',
    validateSearch: (search: Record<string, string>) => ({ q: search.q ?? '' }),
    component: () => <p>Post page</p>,
  });
  // A TanStack Start server route: request handlers and no component.
  const api = createRoute({ getParentRoute: () => root, path: '/api/export' });
  Object.assign(api.options, { server: { handlers: {} } });
  const history = createMemoryHistory({ initialEntries: [basepath] });
  const router = createRouter({
    routeTree: root.addChildren([index, destination, api]),
    history,
    basepath,
  });
  await router.load();
  const navigate = vi.spyOn(router, 'navigate');
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, history, navigate };
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

// jsdom cannot navigate documents, so capture the source window's location.
function captureDocumentNavigation(anchor: Element) {
  const assign = vi.fn();
  const replace = vi.fn();
  const view = new Proxy(window, {
    get: (target, key) =>
      key === 'location'
        ? { origin: target.location.origin, assign, replace }
        : Reflect.get(target, key),
  });
  const owner = new Proxy(document, {
    get(target, key) {
      if (key === 'defaultView') return view;
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  Object.defineProperty(anchor, 'ownerDocument', { value: owner });
  return { assign, replace };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('navigates before release and suppresses the matching click without stopping propagation', async () => {
  const parent = vi.fn();
  const capture = vi.fn();
  const observe = vi.fn();
  const view = await mount(
    <div onClick={parent}>
      <FastLink
        to="/posts/$postId"
        params={{ postId: '42' }}
        search={{ q: 'hello world' }}
        onClickCapture={capture}
        onFastNavigate={observe}
      >
        Post
      </FastLink>
    </div>,
  );
  const anchor = view.getByRole('link');
  press(anchor);
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/42'),
  );
  expect(view.router.state.location.search).toEqual({ q: 'hello world' });
  expect(observe).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
    kind: 'router',
  });
  // Only routing options reach the router, not anchor props or Fast Link options.
  expect(view.navigate).toHaveBeenCalledWith({
    to: '/posts/$postId',
    params: { postId: '42' },
    search: { q: 'hello world' },
  });
  expect(fireEvent.click(anchor, { detail: 1, button: 0 })).toBe(false);
  expect(view.navigate).toHaveBeenCalledTimes(1);
  expect(capture.mock.calls[0]?.[0].defaultPrevented).toBe(true);
  expect(parent).toHaveBeenCalledTimes(1);
});

it('preserves base paths, masked locations, history replacement and state', async () => {
  const view = await mount(
    <FastLink
      to="/posts/$postId"
      params={{ postId: '42' }}
      search={{ q: 'mask' }}
      mask={{ to: '/preview' }}
      replace
      state={{ __hashScrollIntoViewOptions: false }}
      resetScroll={false}
    >
      Post
    </FastLink>,
    '/app',
  );
  expect(view.getByRole('link').getAttribute('href')).toBe('/app/preview');
  press(view.getByRole('link'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/42'),
  );
  expect(view.history.location.pathname).toBe('/app/preview');
  expect(view.history.length).toBe(1);
  expect(view.router.state.location.state.__hashScrollIntoViewOptions).toBe(
    false,
  );
  expect(view.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ replace: true, resetScroll: false }),
  );
});

it.each([
  ['disabled early navigation', { enabled: false }],
  ['touch interaction', {}],
] as const)('keeps ordinary click navigation for %s', async (name, props) => {
  const view = await mount(
    <FastLink to="/posts/42" {...props}>
      Post
    </FastLink>,
  );
  const anchor = view.getByRole('link');
  press(anchor, name === 'touch interaction' ? 'touch' : 'mouse');
  expect(view.navigate).not.toHaveBeenCalled();
  fireEvent.click(anchor, { detail: 1, button: 0 });
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/42'),
  );
  expect(view.navigate).toHaveBeenCalledTimes(1);
});

it('retains keyboard navigation and active render children', async () => {
  const view = await mount(
    <FastLink to="/posts/42">
      {({ isActive }) => (isActive ? 'Current post' : 'Open post')}
    </FastLink>,
  );
  fireEvent.click(view.getByRole('link'), { detail: 0, button: 0 });
  await waitFor(() =>
    expect(view.getByRole('link').textContent).toBe('Current post'),
  );
  expect(view.getByRole('link').getAttribute('aria-current')).toBe('page');
  expect(view.navigate).toHaveBeenCalledTimes(1);
});

it('leaves disabled and document-reload links to TanStack Link', async () => {
  const view = await mount(
    <>
      <FastLink to="/posts/42" disabled>
        Disabled
      </FastLink>
      <FastLink to="/posts/42" reloadDocument>
        Reload
      </FastLink>
    </>,
  );
  press(view.getByText('Disabled'));
  press(view.getByText('Reload'));
  expect(view.navigate).not.toHaveBeenCalled();
});

it('retains a registered navigation blocker without retrying on release', async () => {
  const view = await mount(<FastLink to="/posts/42">Post</FastLink>);
  const blocker = vi.fn(() => true);
  const unblock = view.history.block({ blockerFn: blocker });
  try {
    press(view.getByRole('link'));
    await waitFor(() => expect(blocker).toHaveBeenCalledTimes(1));
    expect(fireEvent.click(view.getByRole('link'), { detail: 1 })).toBe(false);
    expect(view.router.state.location.pathname).toBe('/');
    expect(view.navigate).toHaveBeenCalledTimes(1);
  } finally {
    unblock();
  }
});

it('forwards refs and removes its controller on unmount', async () => {
  const ref = createRef<HTMLAnchorElement>();
  function Links({ postId }: { postId: string }) {
    return (
      <FastLink ref={ref} to="/posts/$postId" params={{ postId }}>
        Post
      </FastLink>
    );
  }
  const view = await mount(<Links postId="first" />);
  const anchor = view.getByRole('link');
  expect(ref.current).toBe(anchor);
  press(anchor);
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/first'),
  );
  await act(async () => {
    await view.router.navigate({ to: '/' });
  });
  view.unmount();
  expect(ref.current).toBeNull();
  const count = view.navigate.mock.calls.length;
  press(anchor);
  expect(view.navigate).toHaveBeenCalledTimes(count);
});

it('gives managed links priority in regions and respects opt-outs', async () => {
  const view = await mount(
    <FastLinkRegion replace>
      <FastLink enabled={false} to="/posts/disabled">
        Managed
      </FastLink>
      <a data-no-fast-link href="/posts/native">
        Native
      </a>
      <a href="/posts/region?q=region">Region</a>
    </FastLinkRegion>,
  );
  press(view.getByText('Managed'));
  press(view.getByText('Native'));
  expect(view.navigate).not.toHaveBeenCalled();
  press(view.getByText('Region'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/region'),
  );
  expect(view.router.state.location.search).toEqual({ q: 'region' });
  expect(view.history.length).toBe(1);
});

it('binds a custom Link renderer through the hook', async () => {
  function CustomLink() {
    const options = { to: '/posts/42', search: { q: 'custom' } };
    const attach = useFastLink(options);
    return (
      <Link {...options} {...attach}>
        Custom
      </Link>
    );
  }
  const view = await mount(<CustomLink />);
  press(view.getByRole('link'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/42'),
  );
  expect(fireEvent.click(view.getByRole('link'), { detail: 1 })).toBe(false);
  expect(view.navigate).toHaveBeenCalledTimes(1);
});

it('uses committed destination updates without losing the pending click', async () => {
  function ChangingLink() {
    const [postId, setPostId] = useState('first');
    return (
      <>
        <FastLink
          to="/posts/$postId"
          params={{ postId }}
          ref={(anchor) => {
            anchor?.setAttribute('data-attached', postId);
          }}
        >
          Post
        </FastLink>
        <button onClick={() => setPostId('second')}>Change destination</button>
      </>
    );
  }
  const view = await mount(<ChangingLink />);
  const anchor = view.getByRole('link');
  press(anchor);
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/first'),
  );
  fireEvent.click(view.getByRole('button'));
  expect(anchor.getAttribute('href')).toBe('/posts/second');
  expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
  expect(view.navigate).toHaveBeenCalledTimes(1);
  press(anchor);
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/second'),
  );
  expect(view.navigate).toHaveBeenCalledTimes(2);
});

it('loads region links the router does not own as documents', async () => {
  const observe = vi.fn();
  const view = await mount(
    <FastLinkRegion onFastNavigate={observe}>
      <a href="/other/page">Outside</a>
      <a href="/app/missing">Missing</a>
      <a href="/app/api/export">Server</a>
      <a href="/app/posts/owned">Owned</a>
    </FastLinkRegion>,
    '/app',
  );
  const origin = window.location.origin;
  for (const [name, path] of [
    ['Outside', '/other/page'],
    ['Missing', '/app/missing'],
    ['Server', '/app/api/export'],
  ] as const) {
    const anchor = view.getByText(name);
    const { assign } = captureDocumentNavigation(anchor);
    press(anchor);
    expect(assign).toHaveBeenCalledExactlyOnceWith(`${origin}${path}`);
  }
  expect(view.navigate).not.toHaveBeenCalled();
  press(view.getByText('Owned'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/owned'),
  );
  expect(observe.mock.calls.map(([, decision]) => decision)).toEqual([
    { kind: 'document', method: 'assign' },
    { kind: 'document', method: 'assign' },
    { kind: 'document', method: 'assign' },
    { kind: 'router' },
  ]);
});

it('runs navigation policies with TanStack proposals', async () => {
  const proposals: unknown[] = [];
  const policy: FastNavigationPolicy = (_intent, proposed) => {
    proposals.push(proposed);
    return proposed.owned
      ? { kind: 'router', scroll: false }
      : { kind: 'document', method: 'replace' };
  };
  const view = await mount(
    <>
      <FastLinkRegion navigationPolicy={policy} replace>
        <a href="/other">Outside</a>
        <a href="/app/posts/region?q=a">Region</a>
      </FastLinkRegion>
      <FastLink
        to="/posts/$postId"
        params={{ postId: 'typed' }}
        search={{ q: 'b' }}
        navigationPolicy={policy}
      >
        Typed
      </FastLink>
    </>,
    '/app',
  );
  const outside = view.getByText('Outside');
  const { replace } = captureDocumentNavigation(outside);
  press(outside);
  expect(replace).toHaveBeenCalledExactlyOnceWith(
    `${window.location.origin}/other`,
  );
  press(view.getByText('Region'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/region'),
  );
  expect(view.navigate).toHaveBeenLastCalledWith({
    href: '/app/posts/region?q=a',
    replace: true,
    resetScroll: false,
  });
  press(view.getByText('Typed'));
  await waitFor(() =>
    expect(view.router.state.location.pathname).toBe('/posts/typed'),
  );
  expect(view.navigate).toHaveBeenLastCalledWith({
    to: '/posts/$postId',
    params: { postId: 'typed' },
    search: { q: 'b' },
    resetScroll: false,
  });
  expect(proposals).toEqual([
    {
      destination: '/app/other',
      method: 'replace',
      scroll: undefined,
      owned: false,
    },
    {
      destination: '/app/posts/region?q=a',
      method: 'replace',
      scroll: undefined,
      owned: true,
    },
    {
      destination: '/app/posts/typed?q=b',
      method: 'push',
      scroll: undefined,
      owned: true,
    },
  ]);
});
