# Routing decisions

Read this when same-origin links can leave the current application, or when
building a navigation adapter that chooses between a router and document
navigation.

## Establish router ownership

Use the application's routing configuration or an existing ownership resolver.
Same origin does not imply that the current client router handles a destination.
Treat foreign or unknown ownership as document navigation. Do not invent a path
prefix or assume an absent resolver means that every route is owned.

Next.js links and regions accept `navigationPolicy(intent, proposed)`. The
proposal contains the computed router destination, history method (`push` or
`replace`), and optional scroll behavior. Use those values when consulting the
application's routing contract. The intent also contains the source anchor,
authored href, and resolved URL.

Match the resolver's verified input contract:

- Deployed URL: `intent.url`, including any base path.
- Router-relative path: the appropriate `proposed.destination`. A region with
  `basePath="/docs"` turns `/docs/overview?tab=1` into `/overview?tab=1`.

Check existing callers and routing configuration before transforming prefixes.

## Choose a supported decision

The policy runs synchronously and returns one of:

| Decision                                  | Effect                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `{ kind: 'router' }`                      | Use the proposed router navigation                               |
| `{ kind: 'router', scroll: false }`       | Use the proposed route and preserve scroll position              |
| `{ kind: 'document', method: 'assign' }`  | Load the validated URL with a new history entry                  |
| `{ kind: 'document', method: 'replace' }` | Load the validated URL while replacing the current history entry |

A router decision can override scroll with a boolean, but cannot replace the
destination, history method, or transition settings. A document decision uses
the captured validated URL. Choose assign versus replace from the application's
history requirement.

There is no policy decision to cancel or defer to a later click. Use a managed
Next.js link's synchronous `onNavigate` cancellation, or opt out before the
press for interactions that need click-time validation. Policies must be
synchronous. Extra decision properties are ignored.

## Share the application policy deliberately

For Next.js, bind the policy in the selected application integration; see the
[link and region example](next.md#application-owned-links-and-regions).
A managed link owns its press and does not inherit the
surrounding region's policy. Ordinary links use the region policy. Nested
regions use outer-first capture ordering.

Use `onFastNavigate(intent, decision)` to observe the frozen decision before
navigation. It cannot change the action, cancel it, or supply a replacement
destination. Its return value is ignored.

## Failure behavior

- A throwing policy or invalid decision attempts document assign to the
  captured URL, then surfaces the policy error. Throwing is not cancellation.
- An observer error still permits the selected navigation attempt.
- A router error surfaces without an additional document fallback.
- If navigation also throws after a policy or observer error, the navigation
  error takes precedence.

For a custom adapter, `runFastNavigation(intent, options)` from
`@fast-link/core` accepts a caller-supplied `defaultRouterDecision`, a `policy`
callback without arguments, an `observe` callback, and a `route` callback.
Capture the application's intent and proposed route in those callbacks. The
default applies only when the policy is absent.
