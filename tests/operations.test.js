import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { validateBookingInput } from '../src/validators/bookingValidator.js';

class FakeOperationsPool {
  users = [
    { id: '1', username: 'customer1', email: 'customer1@netcafe.local', password_hash: '', role: 'CUSTOMER', is_active: true },
    { id: '2', username: 'customer2', email: 'customer2@netcafe.local', password_hash: '', role: 'CUSTOMER', is_active: true },
    { id: '3', username: 'admin', email: 'admin@netcafe.local', password_hash: '', role: 'ADMIN', is_active: true }
  ];

  computers = [
    { id: '1', computer_code: 'PC-001', name: 'Computer 01', status: 'AVAILABLE', hourly_rate: 10000, is_active: true },
    { id: '2', computer_code: 'PC-002', name: 'Computer 02', status: 'MAINTENANCE', hourly_rate: 10000, is_active: true },
    { id: '3', computer_code: 'PC-003', name: 'Computer 03', status: 'IN_USE', hourly_rate: 10000, is_active: true }
  ];

  bookings = [];
  activeSessionComputerIds = ['3'];
  nextComputerId = 4;
  nextBookingId = 1;

  async initialize() {
    for (const user of this.users) user.password_hash = await bcrypt.hash(user.id === '3' ? 'AdminDev123!' : `CustomerDev123!`, 4);
  }

  async query(sql, parameters = []) {
    if (sql.trim() === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (sql.includes('SELECT id, username, email, password_hash')) {
      const user = this.users.find((candidate) => candidate.email.toLowerCase() === parameters[0].toLowerCase());
      return { rows: user ? [user] : [] };
    }
    if (sql.includes('FROM computers WHERE is_active = TRUE') || sql.includes('FROM computers c WHERE c.is_active = TRUE')) {
      return { rows: this.computers.filter((computer) => computer.is_active).map((computer) => ({
        ...computer,
        status: computer.status === 'IN_USE' && !this.activeSessionComputerIds.includes(String(computer.id)) ? 'AVAILABLE' : computer.status
      })) };
    }
    if (sql.includes('FROM computers ORDER BY') || sql.includes('FROM computers c ORDER BY')) {
      return { rows: this.computers.map((computer) => ({
        ...computer,
        status: computer.status === 'IN_USE' && !this.activeSessionComputerIds.includes(String(computer.id)) ? 'AVAILABLE' : computer.status
      })) };
    }
    if (sql.includes('FROM computers WHERE id = $1')) {
      const computer = this.computers.find((candidate) => String(candidate.id) === String(parameters[0]));
      return { rows: computer ? [{ ...computer }] : [] };
    }
    if (sql.includes('INSERT INTO computers')) {
      if (this.computers.some((computer) => computer.computer_code === parameters[0])) {
        const error = new Error('duplicate computer code');
        error.code = '23505';
        throw error;
      }
      const computer = { id: String(this.nextComputerId++), computer_code: parameters[0], name: parameters[1], hourly_rate: Number(parameters[2]), status: parameters[3], is_active: true };
      this.computers.push(computer);
      return { rows: [{ ...computer }] };
    }
    if (sql.includes('UPDATE computers')) {
      const computer = this.computers.find((candidate) => String(candidate.id) === String(parameters[4]));
      if (!computer) return { rows: [] };
      Object.assign(computer, { name: parameters[0], hourly_rate: Number(parameters[1]), status: parameters[2], is_active: parameters[3] });
      return { rows: [{ ...computer }] };
    }
    if (sql.includes('FROM bookings b JOIN computers c') && sql.includes('WHERE b.user_id = $1')) {
      const rows = this.bookings.filter((booking) => String(booking.user_id) === String(parameters[0]));
      return { rows: rows.map((booking) => this.joinBooking(booking)) };
    }
    if (sql.includes('JOIN users u ON u.id = b.user_id')) {
      let rows = [...this.bookings];
      if (sql.includes('b.status = $1')) rows = rows.filter((booking) => booking.status === parameters[0]);
      if (sql.includes('b.computer_id = $1') || sql.includes('b.computer_id = $2')) {
        const computerId = parameters[parameters.length - 1];
        rows = rows.filter((booking) => String(booking.computer_id) === String(computerId));
      }
      return { rows: rows.map((booking) => ({ ...this.joinBooking(booking), username: this.users.find((user) => user.id === booking.user_id).username, email: this.users.find((user) => user.id === booking.user_id).email })) };
    }
    if (sql.includes('FROM bookings b JOIN computers c') && sql.includes('WHERE b.id = $1')) {
      const booking = this.bookings.find((candidate) => String(candidate.id) === String(parameters[0]));
      return { rows: booking ? [this.joinBooking(booking)] : [] };
    }
    if (sql.includes("UPDATE bookings SET status = 'CANCELLED'")) {
      const booking = this.bookings.find((candidate) => String(candidate.id) === String(parameters[0]) && String(candidate.user_id) === String(parameters[1]) && ['PENDING', 'CONFIRMED'].includes(candidate.status));
      if (!booking) return { rows: [] };
      booking.status = 'CANCELLED';
      return { rows: [{ id: booking.id, status: booking.status }] };
    }
    if (sql.includes('UPDATE bookings SET status = $1')) {
      const booking = this.bookings.find((candidate) => String(candidate.id) === String(parameters[1]));
      if (!booking) return { rows: [] };
      booking.status = parameters[0];
      return { rows: [{ id: booking.id, status: booking.status }] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }

  joinBooking(booking) {
    const computer = this.computers.find((candidate) => String(candidate.id) === String(booking.computer_id));
    return { ...booking, computer_code: computer.computer_code, name: computer.name, hourly_rate: computer.hourly_rate };
  }

  async connect() {
    return {
      query: async (sql, parameters = []) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM computers WHERE id = $1 FOR UPDATE')) {
          const computer = this.computers.find((candidate) => String(candidate.id) === String(parameters[0]));
          return { rows: computer ? [{ ...computer }] : [] };
        }
        if (sql.includes("FROM sessions WHERE computer_id = $1 AND status = 'ACTIVE'")) {
          return { rows: this.activeSessionComputerIds.includes(String(parameters[0])) ? [{ id: '1' }] : [] };
        }
        if (sql.includes("UPDATE computers SET status = 'AVAILABLE'")) {
          const computer = this.computers.find((candidate) => String(candidate.id) === String(parameters[0]));
          if (computer) computer.status = 'AVAILABLE';
          return { rows: computer ? [{ ...computer }] : [] };
        }
        if (sql.includes('FROM bookings') && sql.includes('status = ANY')) {
          const [computerId, statuses, startTime, endTime] = parameters;
          const overlap = this.bookings.find((booking) => String(booking.computer_id) === String(computerId)
            && statuses.includes(booking.status)
            && new Date(booking.start_time) < new Date(endTime)
            && new Date(booking.end_time) > new Date(startTime));
          return { rows: overlap ? [{ id: overlap.id }] : [] };
        }
        if (sql.includes('INSERT INTO bookings')) {
          const booking = { id: String(this.nextBookingId++), user_id: String(parameters[0]), computer_id: String(parameters[1]), start_time: parameters[2], end_time: parameters[3], status: 'PENDING', created_at: new Date().toISOString() };
          this.bookings.push(booking);
          return { rows: [{ ...booking }] };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      },
      release() {}
    };
  }
}

async function createHarness() {
  const pool = new FakeOperationsPool();
  await pool.initialize();
  const app = createApp(pool, 'test-only-session-secret-with-more-than-thirty-two-characters');
  return { pool, app, customer: request.agent(app), otherCustomer: request.agent(app), admin: request.agent(app) };
}

async function login(agent, email, password) {
  return agent.post('/login').type('form').send({ email, password });
}

const bookingForm = { computer_id: '1', start_time: '2030-01-01T10:00', end_time: '2030-01-01T12:00' };

describe('NETCAFE computer and booking operations', () => {
  it('interprets datetime-local bookings in Jakarta time regardless of server timezone', () => {
    const validation = validateBookingInput({
      computer_id: '1',
      start_time: '2030-01-01T10:00',
      end_time: '2030-01-01T12:00'
    });

    assert.deepEqual(validation.value, {
      computerId: 1,
      startTime: '2030-01-01T03:00:00.000Z',
      endTime: '2030-01-01T05:00:00.000Z'
    });
  });

  it('allows a customer to view computers', async () => {
    const { customer } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    const response = await customer.get('/computers');
    assert.equal(response.status, 200);
    assert.match(response.text, /PC-001/);
    assert.match(response.text, /MAINTENANCE/);
  });

  it('blocks customers from creating or editing computers', async () => {
    const { customer } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    assert.equal((await customer.post('/admin/computers').type('form').send({ computer_code: 'PC-999', name: 'Nope', hourly_rate: '1', status: 'AVAILABLE' })).status, 403);
    assert.equal((await customer.post('/admin/computers/1/update').type('form').send({ computer_code: 'PC-001', name: 'Nope', hourly_rate: '1', status: 'AVAILABLE' })).status, 403);
  });

  it('allows an admin to create and edit computers', async () => {
    const { admin, pool } = await createHarness();
    await login(admin, 'admin@netcafe.local', 'AdminDev123!');
    assert.equal((await admin.post('/admin/computers').type('form').send({ computer_code: 'PC-999', name: 'Computer 99', hourly_rate: '15000', status: 'AVAILABLE' })).status, 303);
    assert.equal((await admin.post('/admin/computers/1/update').type('form').send({ computer_code: 'PC-001', name: 'Renamed', hourly_rate: '12000', status: 'AVAILABLE', is_active: 'true' })).status, 303);
    assert.equal(pool.computers.find((computer) => computer.id === '1').name, 'Renamed');
  });

  it('allows a customer to create a booking owned by the session user', async () => {
    const { customer, pool } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    const response = await customer.post('/bookings').type('form').send(bookingForm);
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/bookings');
    assert.equal(pool.bookings[0].user_id, '1');
  });

  it('rejects maintenance and in-use computers', async () => {
    const { customer } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    for (const computerId of ['2', '3']) {
      const response = await customer.post('/bookings').type('form').send({ ...bookingForm, computer_id: computerId });
      assert.equal(response.status, 409);
    }
  });

  it('restores an in-use computer without an active session and allows booking it', async () => {
    const { customer, pool } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    pool.activeSessionComputerIds = [];

    const computers = await customer.get('/computers');
    const booking = await customer.post('/bookings').type('form').send({ ...bookingForm, computer_id: '3' });

    assert.match(computers.text, /PC-003[\s\S]*?AVAILABLE/);
    assert.equal(booking.status, 303);
    assert.equal(pool.computers.find((computer) => computer.id === '3').status, 'AVAILABLE');
  });

  it('rejects overlapping active bookings', async () => {
    const { customer, otherCustomer } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    await login(otherCustomer, 'customer2@netcafe.local', 'CustomerDev123!');
    assert.equal((await customer.post('/bookings').type('form').send(bookingForm)).status, 303);
    const overlap = await otherCustomer.post('/bookings').type('form').send({ ...bookingForm, start_time: '2030-01-01T11:00', end_time: '2030-01-01T13:00' });
    assert.equal(overlap.status, 409);
  });

  it('shows only the current customer bookings and protects ownership', async () => {
    const { customer, otherCustomer, pool } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    await login(otherCustomer, 'customer2@netcafe.local', 'CustomerDev123!');
    await customer.post('/bookings').type('form').send(bookingForm);
    await otherCustomer.post('/bookings').type('form').send({ ...bookingForm, computer_id: '1', start_time: '2030-02-01T10:00', end_time: '2030-02-01T12:00' });
    const history = await customer.get('/bookings');
    const foreignId = pool.bookings.find((booking) => booking.user_id === '2').id;
    assert.equal(history.status, 200);
    assert.match(history.text, /2030/);
    assert.doesNotMatch(history.text, /2030-02/);
    assert.equal((await customer.get(`/bookings/${foreignId}`)).status, 403);
    assert.equal((await customer.post(`/bookings/${foreignId}/cancel`)).status, 403);
  });

  it('allows a customer to cancel only an owned active booking', async () => {
    const { customer, pool } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    await customer.post('/bookings').type('form').send(bookingForm);
    assert.equal((await customer.post('/bookings/1/cancel')).status, 303);
    assert.equal(pool.bookings[0].status, 'CANCELLED');
  });

  it('allows admins to view all bookings and update status', async () => {
    const { admin, customer, pool } = await createHarness();
    await login(customer, 'customer1@netcafe.local', 'CustomerDev123!');
    await customer.post('/bookings').type('form').send(bookingForm);
    await login(admin, 'admin@netcafe.local', 'AdminDev123!');
    const list = await admin.get('/admin/bookings');
    assert.equal(list.status, 200);
    assert.match(list.text, /customer1/);
    assert.equal((await admin.post('/admin/bookings/1/status').type('form').send({ status: 'CONFIRMED' })).status, 303);
    assert.equal(pool.bookings[0].status, 'CONFIRMED');
    assert.equal((await admin.post('/admin/bookings/1/status').type('form').send({ status: 'NOT_A_STATUS' })).status, 400);
  });

  it('blocks unauthenticated operation routes', async () => {
    const { app } = await createHarness();
    for (const path of ['/computers', '/bookings', '/admin/computers', '/admin/bookings']) {
      const response = await request(app).get(path);
      assert.equal(response.status, 302, path);
      assert.equal(response.headers.location, '/login', path);
    }
  });
});
