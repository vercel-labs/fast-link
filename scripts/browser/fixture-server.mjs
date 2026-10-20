/* oxlint-disable no-await-in-loop -- Poll the fixture until it is ready. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Starts a built Next.js fixture on a localhost port. The optional fixture path
 * selects an isolated packed consumer; otherwise uses the caller's checkout.
 * waitUntilReady polls readinessPath for 30 seconds, with one-second requests,
 * and closes the child on failure. close is idempotent, waits five seconds after
 * SIGTERM, then five after SIGKILL, and rejects if exit cannot be confirmed.
 * Startup and cleanup failures include captured stdout and stderr.
 */
export async function startFixture(
  root,
  readinessPath,
  fixture = resolve(root, 'fixtures/next-16'),
) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((done, reject) =>
    socket.close((error) => (error ? reject(error) : done())),
  );
  const origin = `http://127.0.0.1:${port}`;
  const url = `${origin}${readinessPath}`;
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
  let processError;
  const exited = new Promise((done) => {
    server.once('exit', done);
    server.on('error', (error) => {
      processError = error;
      if (!server.pid) done();
    });
  });
  server.stdout.on('data', (data) => {
    logs += data;
  });
  server.stderr.on('data', (data) => {
    logs += data;
  });
  const hasExited = () =>
    server.exitCode !== null ||
    server.signalCode !== null ||
    (processError && !server.pid);
  const failure = (message, cause) =>
    new Error(`Fixture ${url}: ${message}\n${logs}`, { cause });
  let closing;

  async function stopServer() {
    if (hasExited()) return;
    server.kill('SIGTERM');
    if (await waitForExit(exited, 5000)) return;
    server.kill('SIGKILL');
    if (await waitForExit(exited, 5000)) return;
    throw failure('did not exit after SIGTERM and SIGKILL', processError);
  }

  function close() {
    closing ??= stopServer();
    return closing;
  }

  function checkProcess() {
    if (processError) throw processError;
    if (hasExited())
      throw new Error(
        `server exited (${server.signalCode ?? server.exitCode})`,
      );
  }

  async function waitUntilReady() {
    const deadline = performance.now() + 30000;
    try {
      while (performance.now() < deadline) {
        checkProcess();
        let ready = false;
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(
              Math.max(
                1,
                Math.ceil(Math.min(1000, deadline - performance.now())),
              ),
            ),
          });
          await response.body?.cancel();
          ready = response.ok;
        } catch {
          // A failed or stalled request may mean the server is still starting.
        }
        checkProcess();
        if (ready) return;
        await delay(Math.max(0, Math.min(100, deadline - performance.now())));
      }
      throw new Error('startup timed out after 30000ms');
    } catch (error) {
      try {
        await close();
      } catch (cleanupError) {
        // oxlint-disable-next-line preserve-caught-error -- Both failures are retained in errors.
        throw new AggregateError(
          [failure(error.message, error), cleanupError],
          'Fixture startup and cleanup failed',
          { cause: cleanupError },
        );
      }
      throw failure(error.message, error);
    }
  }

  return { origin, waitUntilReady, close };
}

async function waitForExit(exited, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise((done) => {
        timer = setTimeout(() => done(false), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
