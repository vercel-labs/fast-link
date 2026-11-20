import { once } from 'node:events';
import { createConnection, createServer } from 'node:net';

/**
 * Starts a localhost TCP proxy to `target` that delays every chunk by half the
 * current RTT in each direction. It models a warm keep-alive connection:
 * connection setup and bandwidth are not delayed or limited, and streamed
 * responses keep their chunk boundaries. `setRtt` applies to chunks received
 * afterward; queued chunks keep their order. The caller must call `close`.
 */
export async function startDelayProxy(target) {
  const { hostname, port } = new URL(target);
  const sockets = new Set();
  let oneWayMs = 0;

  // Half-open sockets let each direction finish its queued chunks after the
  // other side ends.
  const server = createServer({ allowHalfOpen: true }, (client) => {
    const upstream = createConnection({
      port: Number(port),
      host: hostname,
      allowHalfOpen: true,
    });
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.on('close', () => sockets.delete(socket));
    }
    const destroy = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('error', destroy);
    upstream.on('error', destroy);
    forwardDelayed(client, upstream, () => oneWayMs);
    forwardDelayed(upstream, client, () => oneWayMs);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    setRtt(rttMs) {
      oneWayMs = rttMs / 2;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}

/**
 * Writes each chunk from `from` to `to` once its delay elapses, in arrival
 * order, then forwards end-of-stream after the queued chunks.
 */
function forwardDelayed(from, to, readDelayMs) {
  const queue = [];
  let timer;

  function flush() {
    timer = undefined;
    while (queue.length && queue[0].at <= performance.now()) {
      const { chunk } = queue.shift();
      if (to.destroyed) return;
      if (chunk === null) to.end();
      else to.write(chunk);
    }
    if (queue.length)
      timer = setTimeout(flush, Math.max(0, queue[0].at - performance.now()));
  }

  function enqueue(chunk) {
    // The queue is FIFO, so a later chunk never overtakes an earlier one
    // after the delay shrinks.
    queue.push({ chunk, at: performance.now() + readDelayMs() });
    if (timer === undefined) flush();
  }

  from.on('data', enqueue);
  from.on('end', () => enqueue(null));
}
