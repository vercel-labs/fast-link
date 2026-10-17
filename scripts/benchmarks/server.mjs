/* oxlint-disable no-await-in-loop -- Poll the fixture until it is ready. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** Starts the built Next.js fixture on an available localhost port. */
export async function startFixture(root) {
  const fixture = resolve(root, 'fixtures/next-16');
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      resolve(fixture, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let logs = '';
  server.stdout.on('data', (data) => {
    logs += data;
  });
  server.stderr.on('data', (data) => {
    logs += data;
  });

  return {
    origin,
    waitUntilReady: () => waitUntilReady(server, origin, () => logs),
    close: () => stopServer(server),
  };
}

/** Polls readiness for up to 120 attempts; includes server output on failure. */
async function waitUntilReady(server, origin, readLogs) {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null)
      throw new Error(`Server exited: ${readLogs()}`);
    try {
      ready = (await fetch(`${origin}/docs/benchmark`)).ok;
    } catch {
      /* Wait for the production server. */
    }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error(`Server startup timed out: ${readLogs()}`);
}

/** Waits for the fixture process to exit before another measurement starts. */
async function stopServer(server) {
  if (server.exitCode !== null) return;

  const exited = once(server, 'exit');
  server.kill('SIGTERM');
  await exited;
}
