import { spawn } from 'node:child_process';

/** Runs a build or measurement to completion; rejects on launch or exit failure. */
export async function runCommand(command, args, cwd) {
  await new Promise((done, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });

    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
