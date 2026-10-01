const ACTIVE_BOOKING_STATUSES = ['PENDING', 'CONFIRMED'];

export async function findAvailableComputerForUpdate(client, computerId) {
  const result = await client.query(
    `SELECT id, computer_code, name, status, hourly_rate, is_active
     FROM computers WHERE id = $1 FOR UPDATE`,
    [computerId]
  );
  const computer = result.rows[0];
  if (!computer || computer.status !== 'IN_USE') return computer ?? null;

  const activeSession = await client.query(
    `SELECT id FROM sessions WHERE computer_id = $1 AND status = 'ACTIVE' LIMIT 1`,
    [computerId]
  );
  if (activeSession.rows[0]) return computer;

  await client.query(
    `UPDATE computers SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
    [computerId]
  );
  return { ...computer, status: 'AVAILABLE' };
}

export async function hasBookingOverlap(client, computerId, startTime, endTime) {
  const result = await client.query(
    `SELECT id FROM bookings
     WHERE computer_id = $1
       AND status = ANY($2::text[])
       AND start_time < $4
       AND end_time > $3
     LIMIT 1`,
    [computerId, ACTIVE_BOOKING_STATUSES, startTime, endTime]
  );
  return Boolean(result.rows[0]);
}

export async function createBooking(client, { userId, computerId, startTime, endTime }) {
  const result = await client.query(
    `INSERT INTO bookings (user_id, computer_id, start_time, end_time, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING id, user_id, computer_id, start_time, end_time, status, created_at`,
    [userId, computerId, startTime, endTime]
  );
  return result.rows[0];
}

export async function listBookingsForUser(pool, userId) {
  const result = await pool.query(
    `SELECT b.id, b.user_id, b.computer_id, b.start_time, b.end_time, b.status, b.created_at,
            c.computer_code, c.name, c.hourly_rate
     FROM bookings b JOIN computers c ON c.id = b.computer_id
     WHERE b.user_id = $1 ORDER BY b.start_time DESC`,
    [userId]
  );
  return result.rows;
}

export async function listAllBookings(pool, filters = {}) {
  const conditions = [];
  const parameters = [];
  if (filters.status) {
    parameters.push(filters.status);
    conditions.push(`b.status = $${parameters.length}`);
  }
  if (filters.computerId) {
    parameters.push(filters.computerId);
    conditions.push(`b.computer_id = $${parameters.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT b.id, b.user_id, b.computer_id, b.start_time, b.end_time, b.status, b.created_at,
            u.username, u.email, c.computer_code, c.name, c.hourly_rate
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN computers c ON c.id = b.computer_id
     ${where} ORDER BY b.start_time DESC`,
    parameters
  );
  return result.rows;
}

export async function findBookingById(pool, bookingId) {
  const result = await pool.query(
    `SELECT b.id, b.user_id, b.computer_id, b.start_time, b.end_time, b.status,
            c.computer_code, c.name, c.hourly_rate
     FROM bookings b JOIN computers c ON c.id = b.computer_id
     WHERE b.id = $1`,
    [bookingId]
  );
  return result.rows[0] ?? null;
}

export async function cancelBookingForUser(pool, bookingId, userId) {
  const result = await pool.query(
    `UPDATE bookings SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('PENDING', 'CONFIRMED')
     RETURNING id, status`,
    [bookingId, userId]
  );
  return result.rows[0] ?? null;
}

export async function updateBookingStatus(pool, bookingId, status) {
  const result = await pool.query(
    `UPDATE bookings SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING id, status`,
    [status, bookingId]
  );
  return result.rows[0] ?? null;
}
