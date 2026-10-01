export async function listSessionsForAdmin(pool) {
  const result = await pool.query(
    `SELECT s.id, s.status, s.started_at, s.ended_at, s.created_at,
            u.username AS customer_name,
            c.computer_code,
            c.name AS computer_name,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, NOW()) - s.started_at)) / 3600 AS duration_hours
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN computers c ON c.id = s.computer_id
     ORDER BY s.started_at DESC`
  );
  return result.rows;
}

export async function listBookingsReadyForSession(pool) {
  const result = await pool.query(
    `SELECT b.id, b.start_time, b.end_time, u.username AS customer_name,
            c.computer_code, c.name AS computer_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN computers c ON c.id = b.computer_id
     WHERE b.status = 'CONFIRMED'
       AND b.start_time <= NOW()
       AND b.end_time > NOW()
      AND c.status IN ('AVAILABLE', 'IN_USE')
       AND c.is_active = TRUE
       AND NOT EXISTS (
         SELECT 1 FROM sessions s
         WHERE s.computer_id = c.id AND s.status = 'ACTIVE'
       )
     ORDER BY b.start_time ASC`
  );
  return result.rows;
}

export async function startSessionForBooking(pool, { bookingId, userId, computerId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const booking = await client.query(
      `SELECT b.id FROM bookings b
       JOIN computers c ON c.id = b.computer_id
       WHERE b.id = $1 AND b.user_id = $2 AND b.computer_id = $3
         AND b.status = 'CONFIRMED'
         AND b.start_time <= NOW() AND b.end_time > NOW()
         AND c.status IN ('AVAILABLE', 'IN_USE') AND c.is_active = TRUE
       FOR UPDATE OF b, c`,
      [bookingId, userId, computerId]
    );
    if (!booking.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const existing = await client.query(
      `SELECT id FROM sessions WHERE computer_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [computerId]
    );
    if (existing.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    const session = await client.query(
      `INSERT INTO sessions (booking_id, user_id, computer_id, started_at, status)
       VALUES ($1, $2, $3, NOW(), 'ACTIVE')
       RETURNING *`,
      [bookingId, userId, computerId]
    );
    await client.query(
      `UPDATE computers SET status = 'IN_USE', updated_at = NOW() WHERE id = $1`,
      [computerId]
    );
    await client.query(
      `UPDATE bookings SET status = 'CONFIRMED', updated_at = NOW() WHERE id = $1`,
      [bookingId]
    );
    await client.query('COMMIT');
    return session.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function endSessionById(pool, sessionId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionResult = await client.query(
      `SELECT s.*, c.hourly_rate FROM sessions s
       JOIN computers c ON c.id = s.computer_id
       WHERE s.id = $1 FOR UPDATE OF s`,
      [sessionId]
    );
    const session = sessionResult.rows[0];
    if (!session || session.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return null;
    }
    const endedAt = new Date();
    const durationHours = (endedAt - new Date(session.started_at)) / 1000 / 60 / 60;
    const amount = Number((durationHours * Number(session.hourly_rate)).toFixed(2));
    await client.query(
      `UPDATE sessions SET ended_at = $1, status = 'COMPLETED', updated_at = NOW() WHERE id = $2`,
      [endedAt.toISOString(), sessionId]
    );
    await client.query(
      `UPDATE computers SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
      [session.computer_id]
    );
    await client.query(
      `UPDATE bookings SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
      [session.booking_id]
    );
    await client.query(
      `INSERT INTO transactions (booking_id, user_id, amount, status, transaction_type, created_at)
       VALUES ($1, $2, $3, 'PENDING', 'USAGE', NOW())`,
      [session.booking_id, session.user_id, amount]
    );
    await client.query('COMMIT');
    return { ...session, ended_at: endedAt.toISOString(), status: 'COMPLETED', amount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completePendingTransaction(pool, transactionId) {
  const result = await pool.query(
    `UPDATE transactions
     SET status = 'COMPLETED'
     WHERE id = $1 AND status = 'PENDING'
     RETURNING id, status`,
    [transactionId]
  );
  return result.rows[0] ?? null;
}

export async function findBookingById(pool, bookingId) {
  const result = await pool.query(
    `SELECT * FROM bookings WHERE id = $1`,
    [bookingId]
  );
  return result.rows[0] ?? null;
}

export async function listReportsData(pool) {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE role = 'CUSTOMER') AS total_customers,
       (SELECT COUNT(*)::int FROM bookings) AS total_bookings,
       (SELECT COUNT(*)::int FROM sessions) AS total_sessions,
       (SELECT COUNT(*)::int FROM transactions) AS total_transactions,
       (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 3600), 0)::numeric FROM sessions WHERE status = 'COMPLETED') AS total_usage_hours,
       (SELECT COALESCE(SUM(amount), 0)::numeric FROM transactions WHERE status = 'COMPLETED') AS total_revenue`
  );
  return result.rows[0] ?? {};
}
