# Changelog

## 0.0.1

- Add typed `FastLink`, `FastLinkRegion`, and `useFastLink` for TanStack Router
  and TanStack Start applications.
- Preserve navigation options through the public router API and reuse core
  eligibility, click suppression, and React lifecycle handling.
- Accept `navigationPolicy` and report decisions to `onFastNavigate`, matching
  `@fast-link/next`. Regions load URLs the router does not own as documents.
