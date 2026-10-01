import 'dotenv/config';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/database.js';

const app = createApp(pool, env.sessionSecret);
const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`NETCAFE is listening on 0.0.0.0:${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down NETCAFE.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);