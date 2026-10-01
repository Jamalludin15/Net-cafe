import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { completePendingTransaction, endSessionById } from '../src/repositories/sessionRepository.js';

describe('NETCAFE transaction lifecycle', () => {
  it('creates a pending charge using the computer hourly rate when ending a session', async () => {
    const queries = [];
    const client = {
      async query(sql, parameters = []) {
        queries.push({ sql, parameters });
        if (sql.includes('SELECT s.*, c.hourly_rate')) {
          return { rows: [{
            id: 7,
            booking_id: 12,
            user_id: 3,
            computer_id: 4,
            started_at: new Date(Date.now() - 30 * 60 * 1000),
            status: 'ACTIVE',
            hourly_rate: '10000'
          }] };
        }
        return { rows: [] };
      },
      release() {}
    };
    const pool = { async connect() { return client; } };

    await endSessionById(pool, 7);

    const transactionInsert = queries.find(({ sql }) => sql.includes('INSERT INTO transactions'));
    assert.match(transactionInsert.sql, /'PENDING'/);
    assert.equal(transactionInsert.parameters[2], 5000);
    assert.ok(queries.some(({ sql }) => sql.includes("UPDATE bookings SET status = 'COMPLETED'")));
  });

  it('marks only pending transactions as completed', async () => {
    let statement;
    const pool = {
      async query(sql, parameters) {
        statement = { sql, parameters };
        return { rows: [{ id: '21', status: 'COMPLETED' }] };
      }
    };

    const result = await completePendingTransaction(pool, '21');

    assert.deepEqual(result, { id: '21', status: 'COMPLETED' });
    assert.match(statement.sql, /WHERE id = \$1 AND status = 'PENDING'/);
    assert.deepEqual(statement.parameters, ['21']);
  });

  it('does not complete a transaction that is no longer pending', async () => {
    const pool = { async query() { return { rows: [] }; } };

    assert.equal(await completePendingTransaction(pool, '21'), null);
  });
});