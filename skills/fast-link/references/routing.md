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

The policy runs synchronously, without side effects, and returns one of the
decisions below. Release mode can call it twice per gesture: on press, when
Next preparation is available, and again after the click guards. Immediate
mode calls it once on press, after `onNavigate`. Native mode never calls it.
Read current routing data on every call.

| Decision                                  | Effect                                                           |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `{ kind: 'router' }`                      | Use the proposed router navigation                               |
| `{ kind: 'router', scroll: false }`       | Use the proposed route and preserve scroll position              |
| `{ kind: 'document', method: 'assign' }`  | Load the validated URL with a new history entry                  |
| `{ kind: 'document', method: 'replace' }` | Load the validated URL while replacing the current history entry |

- Router decisions can override `scroll`, but not the destination, history
  method, or transition settings.
- Document decisions use the captured validated URL. Choose `assign` or `replace`
  from the application's history requirement.

Policies cannot cancel, defer, or replace the destination. Use synchronous
managed-link `onNavigate` cancellation for validation, keep release mode for
click-time checks, or opt out.

Read the [core decision contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#share-navigation-decisions-in-an-adapter)
for accepted fields, defaults, and custom-adapter usage.

## Share the application policy deliberately

For Next.js, bind the policy in the selected application integration; see the
[link and region example](next.md#application-owned-links-and-regions).
A managed link owns its press and does not inherit the
surrounding region's mode or policy. An ordinary link uses the mode and policy
of its closest region together; a native inner region means no outer policy
runs for its links.

Use `onFastNavigate(intent, decision)` for observation before navigation.
It cannot change or cancel the selected action.

## Failure behavior

Throwing is not cancellation: policy failures attempt document navigation, and
observer failures still permit navigation. Use the
[core decision and error contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#share-navigation-decisions-in-an-adapter)
for validation, callback ordering, document fallback, and error precedence. [ADR 0003](https://github.com/vercel-labs/fast-link/blob/main/docs/adr/0003-let-applications-choose-navigation.md)
explains why adapters share this ordering.

## Custom adapters

Call `runFastNavigation(intent, options)` from `@fast-link/core` with:

- `defaultRouterDecision`, used only when `policy` is absent.
- `policy`, an optional callback without arguments.
- `observe`, an optional callback for the selected decision.
- `route`, a callback that runs router navigation.

Capture the application's intent and proposed route in those callbacks.
