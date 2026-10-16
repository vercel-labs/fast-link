import type { JSX, ReactNode } from 'react';

import { BenchmarkLab } from './lab';

export default function Layout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <BenchmarkLab />
      {children}
    </>
  );
}
