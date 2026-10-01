import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startSessionForBooking } from '../src/repositories/sessionRepository.js';

describe('NETCAFE booking-to-session flow', () => {
  it('starts a session for a confirmed in-window booking when no active session exists', async () => {
    const queries = [];
    const client = {
      async query(sql, parameters = []) {
        queries.push({ sql, parameters });
        if (sql.includes('SELECT b.id FROM bookings')) return { rows: [{ id: '5' }] };
        if (sql.includes("SELECT id FROM sessions WHERE computer_id = $1 AND status = 'ACTIVE'")) return { rows: [] };
        if (sql.includes('INSERT INTO sessions')) return { rows: [{ id: '11', booking_id: '5', status: 'ACTIVE' }] };
        return { rows: [] };
      },
      release() {}
    };
    const pool = { async connect() { return client; } };

    const session = await startSessionForBooking(pool, { bookingId: '5', userId: '2', computerId: '3' });

    assert.deepEqual(session, { id: '11', booking_id: '5', status: 'ACTIVE' });
    assert.ok(queries.some(({ sql }) => sql.includes("b.status = 'CONFIRMED'") && sql.includes('b.start_time <= NOW()') && sql.includes('b.end_time > NOW()')));
    assert.ok(queries.some(({ sql }) => sql.includes("UPDATE computers SET status = 'IN_USE'")));
    assert.ok(queries.some(({ sql }) => sql.includes("UPDATE bookings SET status = 'CONFIRMED'")));
    assert.equal(queries.at(-1).sql, 'COMMIT');
  });

  it('does not create a session when the booking is not eligible', async () => {
    const queries = [];
    const client = {
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT b.id FROM bookings')) return { rows: [] };
        return { rows: [] };
      },
      release() {}
    };
    const pool = { async connect() { return client; } };

    const session = await startSessionForBooking(pool, { bookingId: '5', userId: '2', computerId: '3' });

    assert.equal(session, null);
    assert.ok(queries.includes('ROLLBACK'));
    assert.equal(queries.some((sql) => sql.includes('INSERT INTO sessions')), false);
  });
});