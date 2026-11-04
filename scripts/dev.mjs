import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const server = await createServer({});
await server.listen();
server.printUrls();

const devUrl = `http://localhost:${server.config.server.port}`;

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: devUrl },
});

child.on('close', async () => {
  await server.close();
  process.exit(0);
});
