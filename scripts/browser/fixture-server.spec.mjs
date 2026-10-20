import { ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startFixture } from './fixture-server.mjs';

// Setup runs in a child: use its arguments and Node globals, not parent closures.
async function fixtureRoot(setup) {
  const root = await mkdtemp(join(tmpdir(), 'fast-link-lifecycle-'));
  const cli = join(root, 'fixtures/next-16/node_modules/next/dist/bin');
  await mkdir(cli, { recursive: true });
  await writeFile(
    join(cli, 'next'),
    `(${setup.toString()})(
      require('node:http').createServer,
      Number(process.argv.at(-1)),
    );`,
  );
  return root;
}

async function fixture(setup, run, readinessPath = '/docs') {
  const root = await fixtureRoot(setup);
  let server;
  try {
    server = await startFixture(root, readinessPath);
    await run(server);
  } finally {
    try {
      await server?.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}

it.each(['/docs', '/docs/benchmark'])(
  'waits for %s and confirms exit on close',
  async (readinessPath) => {
    await fixture(
      (createServer, port) => {
        let requested;
        createServer((request, response) => {
          response.end(JSON.stringify({ requested, pid: process.pid }));
          requested = request.url;
        }).listen(port, '127.0.0.1');
      },
      async (server) => {
        await server.waitUntilReady();
        const { requested, pid } = await fetch(server.origin).then((r) =>
          r.json(),
        );
        expect(requested).toBe(readinessPath);
        await server.close();
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: 'ESRCH' }),
        );
        await server.close();
      },
      readinessPath,
    );
  },
);

it('retries a stalled readiness request and cancels successful response bodies', async () => {
  await fixture(
    (createServer, port) => {
      let attempts = 0;
      let cancelled = false;
      createServer((request, response) => {
        if (request.url === '/state') {
          response.end(JSON.stringify({ attempts, cancelled }));
          return;
        }
        if (++attempts === 1) return;
        response.writeHead(200);
        response.write('ready');
        response.on('close', () => {
          cancelled = true;
        });
      }).listen(port, '127.0.0.1');
    },
    async (server) => {
      await server.waitUntilReady();
      await expect
        .poll(() => fetch(`${server.origin}/state`).then((r) => r.json()))
        .toEqual({ attempts: 2, cancelled: true });
    },
  );
}, 5000);

it.each([
  [
    'normal exit',
    () => {
      console.log('startup output');
      console.error('startup error');
      // oxlint-disable-next-line no-process-exit -- The child must exit with a known failure status.
      process.exit(17);
    },
    '17',
  ],
  [
    'signal termination',
    () => {
      console.log('startup output');
      console.error('startup error');
      process.kill(process.pid, 'SIGTERM');
    },
    'SIGTERM',
  ],
])(
  'retains both output streams after %s and closes an exited child',
  async (_name, terminate, status) => {
    await fixture(terminate, async (server) => {
      const error = await server.waitUntilReady().catch((failure) => failure);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(`server exited (${status})`);
      expect(error.message).toContain('startup output');
      expect(error.message).toContain('startup error');
      await server.close();
    });
  },
);

it('reports spawn failure without an unhandled error or cleanup hang', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fast-link-no-fixture-'));
  let server;
  try {
    server = await startFixture(root, '/docs');
    await expect(server.waitUntilReady()).rejects.toThrow('ENOENT');
    await server.close();
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

it('forces exit after a child ignores graceful shutdown', async () => {
  await fixture(
    (createServer, port) => {
      process.on('SIGTERM', () => {
        // Ignore graceful shutdown to exercise forced termination.
      });
      createServer((request, response) => {
        response.end(String(process.pid));
      }).listen(port, '127.0.0.1');
    },
    async (server) => {
      await server.waitUntilReady();
      const pid = Number(await fetch(server.origin).then((r) => r.text()));
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const closing = Promise.all([server.close(), server.close()]);
        await vi.advanceTimersByTimeAsync(4999);
        expect(() => process.kill(pid, 0)).not.toThrow();
        await vi.advanceTimersByTimeAsync(1);
        await closing;
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: 'ESRCH' }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

it('bounds startup even when every readiness request stalls and closes the child', async () => {
  await fixture(
    (createServer, port) => {
      process.on('SIGTERM', () => {
        console.error('stalled child stopped');
        process.exit(0);
      });
      createServer((request, response) => {
        if (request.url === '/pid') response.end(String(process.pid));
      }).listen(port, '127.0.0.1');
    },
    async (server) => {
      let pid;
      await expect
        .poll(async () => {
          pid = Number(
            await fetch(`${server.origin}/pid`).then((r) => r.text()),
          );
          return pid;
        })
        .toBeGreaterThan(0);
      // Advance the startup deadline; the in-flight HTTP request still aborts in real time.
      vi.useFakeTimers({ toFake: ['performance'] });
      try {
        const ready = server.waitUntilReady().catch((failure) => failure);
        await vi.advanceTimersByTimeAsync(30000);
        const error = await ready;
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('startup timed out after 30000ms');
        expect(error.message).toContain('stalled child stopped');
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: 'ESRCH' }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );
});

it('rejects cleanup with diagnostics when signals cannot stop the child', async () => {
  const root = await fixtureRoot((createServer, port) => {
    console.error('shutdown diagnostics');
    createServer((request, response) => {
      response.end(String(process.pid));
    }).listen(port, '127.0.0.1');
  });
  let server;
  let pid;
  let kill;
  try {
    server = await startFixture(root, '/docs');
    await server.waitUntilReady();
    pid = Number(await fetch(server.origin).then((r) => r.text()));
    // Simulate an OS that refuses both signals while keeping real child events.
    kill = vi.spyOn(ChildProcess.prototype, 'kill').mockReturnValue(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let settled = false;
    const closing = server
      .close()
      .finally(() => {
        settled = true;
      })
      .catch((failure) => failure);
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await closing;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('did not exit after SIGTERM and SIGKILL');
    expect(error.message).toContain('shutdown diagnostics');
  } finally {
    vi.useRealTimers();
    kill?.mockRestore();
    if (pid) {
      process.kill(pid, 'SIGKILL');
      await expect
        .poll(() => {
          try {
            process.kill(pid, 0);
            return false;
          } catch (error) {
            if (error.code === 'ESRCH') return true;
            throw error;
          }
        })
        .toBe(true);
    } else {
      await server?.close();
    }
    await rm(root, { recursive: true, force: true });
  }
});
