import { resolve } from 'node:path';
import { createServer } from 'vite';
import { buildServer } from '../src/server/buildServer.js';
import { DEFAULT_PORT } from '../src/server/main.js';

const apiPort = DEFAULT_PORT + 1;
const logFilePath = resolve('eval-viewer.dev.log');
const resultRoot = resolve(process.argv[2] ?? '.tmp/visual-fixture');

const api = await buildServer({ logFilePath, resultRoot });
await api.listen({ host: '127.0.0.1', port: apiPort });

const vite = await createServer({
  server: {
    host: '0.0.0.0',
    port: DEFAULT_PORT,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`
    },
    strictPort: true
  }
});
await vite.listen();
vite.printUrls();

async function shutdown() {
  await vite.close();
  await api.close();
}

process.once('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
