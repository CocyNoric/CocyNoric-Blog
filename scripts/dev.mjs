import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const processes = [];
let exiting = false;

function stop(signal = 'SIGTERM') {
  if (exiting) return;
  exiting = true;
  for (const child of processes) child.kill(signal);
}

function watch(child) {
  processes.push(child);
  child.on('exit', (code) => {
    if (!exiting) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

const backendPort = Number.parseInt(process.env.BLOG_PORT ?? '3000', 10);
const configuredProxyHost = process.env.BLOG_PROXY_HOST ?? '127.0.0.1';
const backendHost = configuredProxyHost === '0.0.0.0' ? '127.0.0.1' : configuredProxyHost;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const onExit = (code) => reject(new Error(`博客服务启动失败（退出码 ${code ?? 1}）`));
    child.once('exit', onExit);

    const check = () => {
      const request = http.get(`http://${backendHost}:${backendPort}/api/settings`, (response) => {
        response.resume();
        child.off('exit', onExit);
        resolve();
      });
      request.setTimeout(500, () => request.destroy());
      request.on('error', () => {
        if (!exiting) setTimeout(check, 50);
      });
    };

    check();
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], { stdio: 'inherit' });
watch(server);

try {
  await waitForServer(server);
  if (!exiting) {
    watch(spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }));
  }
} catch (error) {
  console.error((error).message);
  stop();
  process.exitCode = 1;
}
