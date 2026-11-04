# Start navigation on primary mouse pointerdown

Superseded by [Prepare on press, navigate on accepted click](./0006-prepare-on-press-navigate-on-click.md).

The original design navigated on primary mouse press and suppressed the later
click. It gave up release-time cancellation to start navigation earlier. The
current design prepares on press and waits for accepted click; the old controller
and suppression APIs have been removed.
