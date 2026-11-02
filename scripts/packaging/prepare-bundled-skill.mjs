import { cpSync, rmSync } from 'node:fs';

const destination = 'skills/fast-link';
rmSync(destination, { recursive: true, force: true });
cpSync(new URL('../../skills/fast-link/', import.meta.url), destination, {
  recursive: true,
});
