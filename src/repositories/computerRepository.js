export async function listActiveComputers(pool) {
  const result = await pool.query(
    `SELECT c.id, c.computer_code, c.name,
            CASE WHEN c.status = 'IN_USE' AND NOT EXISTS (
              SELECT 1 FROM sessions s WHERE s.computer_id = c.id AND s.status = 'ACTIVE'
            ) THEN 'AVAILABLE' ELSE c.status END AS status,
            c.hourly_rate, c.is_active
     FROM computers c WHERE c.is_active = TRUE ORDER BY c.computer_code`
  );
  return result.rows;
}

export async function listComputers(pool) {
  const result = await pool.query(
    `SELECT c.id, c.computer_code, c.name,
            CASE WHEN c.status = 'IN_USE' AND NOT EXISTS (
              SELECT 1 FROM sessions s WHERE s.computer_id = c.id AND s.status = 'ACTIVE'
            ) THEN 'AVAILABLE' ELSE c.status END AS status,
            c.hourly_rate, c.is_active
     FROM computers c ORDER BY c.computer_code`
  );
  return result.rows;
}

export async function findComputerById(pool, id) {
  const result = await pool.query(
    `SELECT id, computer_code, name, status, hourly_rate, is_active
     FROM computers WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createComputer(pool, { code, name, hourlyRate, status }) {
  const result = await pool.query(
    `INSERT INTO computers (computer_code, name, hourly_rate, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, computer_code, name, status, hourly_rate, is_active`,
    [code, name, hourlyRate, status]
  );
  return result.rows[0];
}

export async function updateComputer(pool, id, { name, hourlyRate, status, isActive }) {
  const result = await pool.query(
    `UPDATE computers
     SET name = $1, hourly_rate = $2, status = $3, is_active = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING id, computer_code, name, status, hourly_rate, is_active`,
    [name, hourlyRate, status, isActive, id]
  );
  return result.rows[0] ?? null;
}
