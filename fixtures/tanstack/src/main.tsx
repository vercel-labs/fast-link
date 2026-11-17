import {
  FastLink,
  FastLinkRegion,
  type FastLinkProps,
} from '@fast-link/tanstack';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';

function Layout() {
  const location = useRouterState({ select: (state) => state.location });
  return (
    <main>
      <h1>TanStack Fast Link</h1>
      <p>Press and hold a link. The route changes before release.</p>
      <nav aria-label="Test links">
        <FastLink
          to="/posts/$postId"
          params={{ postId: '42' }}
          search={{ q: 'hello world' }}
        >
          Fast post
        </FastLink>
        {' | '}
        <FastLink
          to="/posts/$postId"
          params={{ postId: 'replace' }}
          search={{ q: '' }}
          replace
          resetScroll={false}
        >
          Replace post
        </FastLink>
        {' | '}
        <FastLink
          to="/posts/$postId"
          params={{ postId: 'native' }}
          search={{ q: '' }}
          enabled={false}
        >
          Native post
        </FastLink>
        {' | '}
        <FastLink
          to="/posts/$postId"
          params={{ postId: 'masked' }}
          search={{ q: '' }}
          mask={{ to: '/preview' }}
        >
          Masked post
        </FastLink>
        {' | '}
        <Link to="/">Home</Link>
      </nav>
      <FastLinkRegion>
        <a href="/app/posts/region?q=region">Region post</a>
      </FastLinkRegion>
      <output aria-label="Current route">
        {location.pathname}
        {location.searchStr}
      </output>
      <Outlet />
    </main>
  );
}
const root = createRootRoute({ component: Layout });
const home = createRoute({
  getParentRoute: () => root,
  path: '/',
  component: () => <h2>Home page</h2>,
});
const post = createRoute({
  getParentRoute: () => root,
  path: '/posts/$postId',
  validateSearch: (search: Record<string, string>) => ({ q: search.q ?? '' }),
  component: () => <h2>Post page</h2>,
});
const preview = createRoute({ getParentRoute: () => root, path: '/preview' });
const router = createRouter({
  routeTree: root.addChildren([home, post, preview]),
  basepath: '/app',
});
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Compile the published generic props against a registered route tree.
export const typedDestination: FastLinkProps<
  typeof router,
  '/',
  '/posts/$postId'
> = {
  to: '/posts/$postId',
  params: { postId: '42' },
  search: { q: 'typed' },
};
export const invalidDestination: FastLinkProps<
  typeof router,
  '/',
  '/posts/$postId'
> = {
  to: '/posts/$postId',
  // @ts-expect-error The adapter must reject params missing postId.
  params: { wrong: '42' },
  search: { q: '' },
};
// @ts-expect-error The adapter must reject unregistered routes.
export const invalidRoute = <FastLink to="/missing" />;

const element = document.getElementById('root');
if (!element) throw new Error('Missing root');
createRoot(element).render(<RouterProvider router={router} />);
