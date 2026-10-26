// Inventory of TS/TSX blocks in the published quickstarts and integration guides.
// Block numbers count only ts/tsx fences within each file, in document order.
export const examples = [
  { file: 'README.md', blocks: 2 },
  { file: 'packages/core/README.md', blocks: 5, signatures: [3] },
  { file: 'packages/react/README.md', blocks: 2, signatures: [2] },
  { file: 'packages/next/README.md', blocks: 6 },
  { file: 'skills/fast-link/SKILL.md', blocks: 0 },
  { file: 'skills/fast-link/references/adapters.md', blocks: 2 },
  { file: 'skills/fast-link/references/routing.md', blocks: 0 },
  {
    file: 'skills/fast-link/references/next.md',
    blocks: 4,
    placeholders: {
      3: {
        'route-ownership.d.ts':
          'export declare function ownsRoute(url: URL): boolean;',
      },
      4: {
        'app-link-renderer.d.ts': `import type { ComponentPropsWithRef, ForwardRefExoticComponent } from 'react';
import Link from 'next/link';
export declare const AppLinkRenderer: ForwardRefExoticComponent<ComponentPropsWithRef<typeof Link>>;`,
      },
    },
  },
];
