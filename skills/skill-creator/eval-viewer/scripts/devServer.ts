import { createServer } from 'vite';
import { buildServer } from '../src/server/buildServer.js';
import { startDevServer } from '../src/server/devServer.js';

const devServer = await startDevServer({ argv: process.argv, buildServer, createServer });

process.once('SIGINT', async () => {
  await devServer.shutdown();
  process.exit(0);
});
process.once('SIGTERM', async () => {
  await devServer.shutdown();
  process.exit(0);
});
