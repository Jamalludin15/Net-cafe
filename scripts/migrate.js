import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';

const projectDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDirectory = path.join(projectDirectory, 'database', 'migrations');

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of migrationFiles) {
    const { rowCount } = await pool.query(
      'SELECT name FROM schema_migrations WHERE name = $1',
      [name]
    );

    if (rowCount > 0) {
      console.log(`Skipping already applied migration: ${name}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDirectory, name), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} catch (error) {
  console.error('Database migration failed. Check database availability and migration SQL.');
  if (process.env.NODE_ENV !== 'production') {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}