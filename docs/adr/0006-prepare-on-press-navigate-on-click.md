# Prepare on press, navigate on accepted click

Every integration prepares on eligible mouse press and waits for accepted click
to navigate. This preserves cancellation before acceptance while starting router
work early. The press-navigation controller, suppression registry, and old React
binding are removed without compatibility aliases.

Core owns one gesture controller and opaque preparation. React owns its ref and
committed-option lifetime. One Next adapter owns prepared router handles, current
policy, and commit options. A handle belongs to a router and destination; changes
to policy callback identity, history method, scroll, or transitions do not make
its prepared work stale. Current policy must still choose router navigation.

`FastLink` accepts after caller click guards and Next's navigation guards. Regions
and custom-renderer hooks accept during click capture. The hook runs its supplied
capture and navigation guards first; later child guards cannot cancel. Consumers
that need those later guards use `FastLink` or opt out. Waiting for arbitrary
renderers' callbacks would require another adapter protocol.

Preparation failures leave ordinary click-time routing available. A failed commit
is never retried because navigation may already have started. Discarding a handle
does not abort provider work. `as`, `legacyBehavior`, optional-href hooks, and
non-anchor hook refs are outside the new contract.
