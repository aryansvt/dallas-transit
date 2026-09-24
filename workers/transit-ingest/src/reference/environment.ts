import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { graphql } from './otp.js';

const execute = promisify(execFile);
async function docker(...args: string[]) {
  const { stdout } = await execute('docker', args, {
    timeout: 240000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout.trim();
}

/** Fresh disposable container: no stale graphs/configuration or shared volume.
 * Keep it until logs are captured, including early failures; then remove only
 * this UUID-named container. Never remove shared networks, images, or volumes. */
export async function startOtp() {
  const name = `linefinder-otp-${randomUUID()}`;
  const stop = async () => {
    try {
      await writeFile('data/raw/otp/container.log', await docker('logs', name));
    } finally {
      await docker('stop', '--timeout', '10', name);
      await docker('rm', name);
    }
  };
  await docker(
    'compose',
    '-f',
    'tools/otp/compose.yaml',
    'run',
    '--detach',
    '--no-deps',
    '--publish',
    '127.0.0.1::8080',
    '--name',
    name,
    'otp',
  );
  try {
    const binding = await docker('port', name, '8080/tcp');
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error(`Unexpected OTP binding: ${binding}`);
    const endpoint = `http://${binding}/otp/gtfs/v1`;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const state = await docker(
        'inspect',
        '--format',
        '{{.State.Status}}',
        name,
      );
      if (state !== 'running')
        throw new Error(
          `OTP exited during startup (${state}); see container.log`,
        );
      try {
        await graphql(endpoint, '{ feeds { feedId } }');
        return { endpoint, name, stop };
      } catch {
        await setTimeout(500);
      }
    }
    throw new Error('OTP was not ready within 180 seconds; see container.log');
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'OTP startup and cleanup failed',
      );
    }
    throw error;
  }
}
