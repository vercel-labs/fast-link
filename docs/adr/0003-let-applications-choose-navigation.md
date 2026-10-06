# Let applications choose router or document navigation

A same-origin URL may belong to another application that the current client
router cannot handle. Fast Link validates link eligibility; applications
classify router ownership through a synchronous navigation policy. Adapters
construct router proposals, and core runs the selected decision.

Plain core controllers default to document navigation through
`location.assign()`. The Next adapter defaults to the current App Router when
no policy is supplied. A supplied policy should choose document navigation for
foreign or unknown ownership; Fast Link does not infer that ownership.

Decisions have a small, fixed shape:

- Router navigation uses the adapter's destination and history method, with
  an optional scroll override.
- Document navigation selects `assign` or `replace` for the validated URL.
- A decision cannot supply a new destination, defer asynchronously, or return
  control to the original click. Use `enabled` or `data-no-fast-link` to opt out
  before a press is accepted.

The Next adapter captures its router destination before calling policy. Core
captures the document URL and validates the decision. Changing the intent or
proposal inside policy cannot redirect either action. This keeps ownership
classification separate from destination construction.

Core shares sequencing and error handling across adapters:

- Policy errors and invalid decisions skip observation, attempt document
  `assign` to the captured URL, and surface the error.
- Observation receives a frozen decision before navigation. Navigation is
  still attempted if the observer throws.
- Router errors surface without document fallback, avoiding a second
  navigation after a router action may have started.
- If observation and navigation both throw, or policy and fallback both throw,
  an `AggregateError` contains both errors.

Duplicating this sequence in each adapter would let callback ordering and
failure behavior differ. Sharing it in core keeps those rules consistent while
leaving framework routes and application ownership with their callers.

Implementation: [decision runner](../../packages/core/src/navigation/index.ts#L34)
and [Next policy](../../packages/next/src/use-fast-link/index.ts#L70).
The [policy tests](../../packages/next/src/navigation-policy/index.test.tsx#L9)
check destination preservation and per-link decisions inside regions.
