import { fireEvent, render } from '@testing-library/react';
import { StrictMode } from 'react';

import { useClickPreparation } from './index';

it('preserves preparation across committed updates and cleans up replaced roots and refs', () => {
  const prepare = vi.fn(() => 'request');
  const accepted = vi.fn();
  const cleanup = vi.fn();
  const forwardedRef = vi.fn(() => cleanup);
  function Link({
    label,
    section = false,
  }: {
    label: string;
    section?: boolean;
  }) {
    const binding = useClickPreparation({ prepare, forwardedRef });
    const props = {
      ref: binding.ref,
      onClick: (event: React.MouseEvent) => {
        const activation = binding.matchClick(event.nativeEvent);
        event.preventDefault();
        const result = activation?.consume();
        if (result) accepted(result.prepared);
      },
    };
    return section ? (
      <section {...props}>
        <a href="/guide">{label}</a>
      </section>
    ) : (
      <div {...props}>
        <a href="/guide">{label}</a>
      </div>
    );
  }
  const { getByRole, rerender, unmount } = render(
    <StrictMode>
      <Link label="First" />
    </StrictMode>,
  );
  const press = (anchor: HTMLElement) => {
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(event);
  };
  press(getByRole('link'));
  rerender(
    <StrictMode>
      <Link label="Updated" />
    </StrictMode>,
  );
  fireEvent.click(getByRole('link'), { detail: 1 });
  expect(accepted).toHaveBeenCalledExactlyOnceWith('request');
  press(getByRole('link'));
  rerender(
    <StrictMode>
      <Link label="Replaced" section />
    </StrictMode>,
  );
  fireEvent.click(getByRole('link'), { detail: 1 });
  expect(accepted).toHaveBeenCalledTimes(1);
  unmount();
  expect(cleanup).toHaveBeenCalledTimes(forwardedRef.mock.calls.length);
});
