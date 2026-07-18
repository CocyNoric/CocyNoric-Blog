import { spawn } from 'node:child_process';
import process from 'node:process';

const child = spawn(process.execPath, ['dist/server/server/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code) => { process.exitCode = code ?? 0; });
