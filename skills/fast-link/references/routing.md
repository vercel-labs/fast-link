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

Return a synchronous router decision (`{ kind: 'router' }`, optionally overriding
`scroll`) or document decision (`{ kind: 'document', method: 'assign' }` or
`'replace'`). Choose history behavior from the application's requirement.
Policies cannot cancel, defer, or replace the destination. Use synchronous
managed-link `onNavigate` cancellation for press-time validation, or opt out for
release-time checks.

Read the [complete decision contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#share-navigation-decisions-in-an-adapter)
for accepted fields, defaults, and custom-adapter usage.

## Share the application policy deliberately

For Next.js, bind the policy in the selected application integration; see the
[link and region example](next.md#application-owned-links-and-regions).
A managed link owns its press and does not inherit the
surrounding region's policy. Ordinary links use the region policy. Nested
regions use outer-first capture ordering.

Use `onFastNavigate(intent, decision)` for observation before navigation.
It cannot change or cancel the selected action.

## Failure behavior

Throwing is not cancellation: policy failures attempt document navigation, and
observer failures still permit navigation. Use the
[canonical sequencing and error contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#share-navigation-decisions-in-an-adapter)
when implementing or reviewing failure paths; it defines validation, fallback,
and error precedence. [ADR 0003](https://github.com/vercel-labs/fast-link/blob/main/docs/adr/0003-let-applications-choose-navigation.md)
explains why adapters share this ordering.
