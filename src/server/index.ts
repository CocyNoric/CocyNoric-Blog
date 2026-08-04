import { cleanExpiredSessions } from './auth.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { dataStore } from './dataStore.js';
import { optimizeStoredSettingMedia } from './media.js';

await dataStore.initialize();
await optimizeStoredSettingMedia();
await cleanExpiredSessions();
setInterval(() => void cleanExpiredSessions(), 60 * 60 * 1000).unref();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`博客服务已启动：http://${config.host}:${config.port}`);
  console.log(`数据目录：${config.dataDir}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`收到 ${signal}，正在停止博客服务……`);

  const forceShutdown = setTimeout(() => {
    console.error('等待连接结束超时，强制停止博客服务');
    server.closeAllConnections();
    process.exit(1);
  }, 30_000);
  forceShutdown.unref();

  server.close((error) => {
    clearTimeout(forceShutdown);
    if (error) console.error('停止博客服务失败', error);
    process.exit(error ? 1 : 0);
  });
  server.closeIdleConnections();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
