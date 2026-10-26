# Let applications choose router or document navigation

A same-origin URL may belong to another application that the current client
router cannot handle. Fast Link validates link eligibility; applications
classify router ownership through a synchronous navigation policy. Adapters
construct router proposals, and core runs the selected decision.

Plain core controllers default to document navigation through
`location.assign()`. The Next adapter defaults to the current App Router when
no policy is supplied. A supplied policy should choose document navigation for
foreign or unknown ownership; Fast Link does not infer that ownership.

A policy selects router or document navigation synchronously. It cannot change
the destination or router history method, or return control to the original
click. The Next adapter captures its router destination before policy runs;
core captures the document destination. This keeps application ownership
decisions separate from destination construction.

Core shares sequencing and error handling across adapters:

- Policy errors and invalid decisions skip observation, attempt document
  `assign` to the captured URL, and surface the error.
- Observation receives a frozen decision before navigation. Navigation is
  still attempted if the observer throws.
- Router errors surface without document fallback, avoiding a second
  navigation after a router action may have started.
- If navigation also throws after a policy or observer error, the navigation
  error takes precedence.

Duplicating this sequence in each adapter would let callback ordering and
failure behavior differ. Sharing it in core keeps those rules consistent while
leaving framework routes and application ownership with their callers.

Implementation: [`runFastNavigation`](../../packages/core/src/navigation/index.ts)
and [`useFastLink`](../../packages/next/src/use-fast-link/index.ts).
The [core navigation reference](../../packages/core/README.md#share-navigation-decisions-in-an-adapter)
documents the supported decision fields.
The [navigation policy tests](../../packages/next/src/navigation-policy/index.test.tsx)
check destination preservation and per-link decisions inside regions.
