export async function findDuplicate(pool, username, email) {
  const result = await pool.query(
    `SELECT id FROM users
     WHERE lower(username) = lower($1) OR lower(email) = lower($2)
     LIMIT 1`,
    [username, email]
  );

  return result.rows[0] ?? null;
}

export async function createCustomer(pool, { username, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, 'CUSTOMER')
     RETURNING id, username, email, role`,
    [username, email, passwordHash]
  );

  return result.rows[0];
}

export async function findById(pool, id) {
  const result = await pool.query(
    `SELECT id, username, email, password_hash, role, is_active, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, username, email, password_hash, role, is_active, created_at
     FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function listUsers(pool, role = null) {
  const sql = role
    ? `SELECT id, username, email, role, is_active, created_at FROM users WHERE role = $1 ORDER BY created_at DESC`
    : `SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC`;
  const params = role ? [role] : [];
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function updateCustomerAdmin(pool, id, { email, isActive }) {
  const result = await pool.query(
    `UPDATE users SET email = $1, is_active = $2, updated_at = NOW() WHERE id = $3 RETURNING id, username, email, role, is_active, created_at`,
    [email, isActive, id]
  );
  return result.rows[0] ?? null;
}

export async function createAdminUser(pool, { username, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'ADMIN', TRUE)
     RETURNING id, username, email, role, is_active`,
    [username, email, passwordHash]
  );
  return result.rows[0];
}

export async function countCustomerBookings(pool, userId) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM bookings WHERE user_id = $1`, [userId]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function countCustomerTransactions(pool, userId) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM transactions WHERE user_id = $1`, [userId]);
  return Number(result.rows[0]?.count ?? 0);
}

export async function getCustomerUsageSummary(pool, userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 3600), 0)::numeric AS total_hours,
            COALESCE(SUM(t.amount), 0)::numeric AS total_amount
     FROM sessions s
     LEFT JOIN transactions t ON t.booking_id = s.booking_id AND t.user_id = s.user_id
     WHERE s.user_id = $1 AND s.status = 'COMPLETED'`,
    [userId]
  );
  return result.rows[0] ?? { total_hours: 0, total_amount: 0 };
}

export async function listAdminUsers(pool) {
  const result = await pool.query(
    `SELECT id, username, email, role, is_active, created_at FROM users WHERE role = 'ADMIN' ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getAdminDashboardSummary(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'CUSTOMER') AS total_customers,
      (SELECT COUNT(*)::int FROM computers WHERE status = 'AVAILABLE' AND is_active = TRUE) AS available_computers,
      (SELECT COUNT(*)::int FROM computers WHERE status = 'IN_USE' AND is_active = TRUE) AS in_use_computers,
      (SELECT COUNT(*)::int FROM computers WHERE status = 'MAINTENANCE' AND is_active = TRUE) AS maintenance_computers,
      (SELECT COUNT(*)::int FROM bookings WHERE status IN ('PENDING', 'CONFIRMED')) AS active_bookings,
      (SELECT COUNT(*)::int FROM sessions WHERE status = 'ACTIVE') AS active_sessions,
      (SELECT COUNT(*)::int FROM transactions) AS total_transactions,
      (SELECT COALESCE(SUM(amount), 0)::numeric FROM transactions WHERE status = 'COMPLETED') AS revenue_total
  `);
  return result.rows[0] ?? {};
}

export async function getAdminTransactions(pool) {
  const result = await pool.query(
    `SELECT t.id, u.username, b.id AS booking_id, c.computer_code, c.name AS computer_name,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) / 3600 AS duration_hours,
            t.amount, t.status, t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN bookings b ON b.id = t.booking_id
     LEFT JOIN computers c ON c.id = b.computer_id
     LEFT JOIN sessions s ON s.booking_id = b.id AND s.user_id = t.user_id
     ORDER BY t.created_at DESC`
  );
  return result.rows;
}