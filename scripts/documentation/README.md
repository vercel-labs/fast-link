# Check published examples

Run from the repository root on Node.js 24:

```sh
pnpm build
pnpm typecheck:examples
```

The check reads the TS/TSX fences from these files and compiles their contents
against built public package exports. Block numbers count only TS/TSX fences,
in document order. Each block gets a separate module; examples with the same
export name do not share scope.

Keep examples at the document's top level in unindented triple-backtick `ts` or
`tsx` fences without trailing whitespace. The check rejects trailing whitespace,
tilde fences, longer backtick fences, and fences indented by one to three spaces.

| Source                                    | Checked blocks                                                  | Partial references |
| ----------------------------------------- | --------------------------------------------------------------- | ------------------ |
| Root `README.md`                          | 1-2: managed link, region                                       | None               |
| `packages/core/README.md`                 | 1-2, 4-5: DOM setup, router callback, updates, adapter          | 3: API signature   |
| `packages/react/README.md`                | 1: React region                                                 | 2: API signature   |
| `packages/next/README.md`                 | 1-6: managed link, region, base path, opt-out, policy, renderer | None               |
| `skills/fast-link/references/adapters.md` | 1-2: DOM and React adapters                                     | None               |
| `skills/fast-link/references/next.md`     | 1-4: region, managed link, application wrappers, renderer       | None               |

The skill entry point and routing reference currently contain no TS/TSX blocks;
the inventory checks that too. The two API signature fragments are labeled in
their READMEs and excluded from integration compilation.

All integration examples are standalone modules except the Next skill's blocks
3 and 4. Those templates import application-owned modules. The
[inventory](./examples.mjs) supplies explicit declarations for
`ownsRoute(url: URL): boolean` and an `AppLinkRenderer` accepting Next Link props
and forwarding an anchor ref. It supplies no implementation or `any` types.
Verify the real application's modules separately before integration.

The command reports each source location, block number, and classification,
then the result. It is also part of `pnpm validate` and full PR CI. Typechecking
does not prove navigation timing, event suppression, or framework behavior;
those remain covered by controller, browser, and production fixture tests.
