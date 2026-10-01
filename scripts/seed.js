import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import { developmentComputers, developmentUsers } from '../database/seeds/development.js';

if (process.env.NODE_ENV !== 'development') {
  console.error('Development seed is disabled unless NODE_ENV=development.');
  process.exit(1);
}

try {
  for (const user of developmentUsers) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    await pool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = TRUE,
         updated_at = NOW()`,
      [user.username, user.email, passwordHash, user.role]
    );
  }

  for (const computer of developmentComputers) {
    await pool.query(
      `INSERT INTO computers (computer_code, name, status, hourly_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (computer_code) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         hourly_rate = EXCLUDED.hourly_rate,
         is_active = TRUE,
         updated_at = NOW()`,
      [computer.code, computer.name, computer.status, computer.rate]
    );
  }

  console.log('Development seed completed: 1 admin, 2 customers, 5 computers.');
  console.log('Development-only credentials: admin / AdminDev123!, customer1 / CustomerDev123!, customer2 / CustomerDev123!');
} catch (error) {
  console.error('Database seed failed. Check database availability and run migrations first.');
  if (process.env.NODE_ENV !== 'production') {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
