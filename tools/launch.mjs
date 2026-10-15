// Build the latest changes (no installer) and launch the result detached, so it keeps running after this command exits.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const exe = path.resolve('target', 'release', 'archiver.exe');
// Windows locks a running exe, so the old instance must exit before it can be relinked.
spawnSync('taskkill', ['/IM', 'archiver.exe', '/F'], { stdio: 'ignore' });
const build = spawnSync(process.execPath, ['tools/desktop.mjs', 'build'], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error('Build failed; the app was closed for the rebuild and not relaunched.');
  process.exit(build.status ?? 1);
}
if (!existsSync(exe)) throw new Error(`Expected executable not found: ${exe}`);
spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
console.log(`Launched ${exe}`);
