import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

class FakeUserPool {
  users = [];
  nextId = 1;

  async query(sql, parameters = []) {
    if (sql.includes('SELECT 1')) {
      return { rows: [{ '?column?': 1 }] };
    }

    if (sql.includes('available_computers') || sql.includes('total_customers')) {
      return { rows: [{
        total_customers: 0,
        available_computers: 0,
        in_use_computers: 0,
        maintenance_computers: 0,
        active_bookings: 0,
        active_sessions: 0,
        total_transactions: 0,
        revenue_total: '0'
      }] };
    }

    if (sql.includes('WHERE lower(username) = lower($1)')) {
      const [username, email] = parameters;
      const user = this.users.find((candidate) =>
        candidate.username.toLowerCase() === username.toLowerCase()
        || candidate.email.toLowerCase() === email.toLowerCase()
      );
      return { rows: user ? [{ id: user.id }] : [] };
    }

    if (sql.includes('INSERT INTO users')) {
      const [username, email, passwordHash] = parameters;
      if (this.users.some((user) => user.username === username || user.email === email)) {
        const error = new Error('unique constraint');
        error.code = '23505';
        throw error;
      }

      const user = {
        id: String(this.nextId++),
        username,
        email,
        password_hash: passwordHash,
        role: 'CUSTOMER',
        is_active: true
      };
      this.users.push(user);
      return { rows: [{ id: user.id, username, email, role: user.role }] };
    }

    if (sql.includes('password_hash')) {
      const [email] = parameters;
      const user = this.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());
      return { rows: user ? [user] : [] };
    }

    throw new Error(`Unexpected query in FakeUserPool: ${sql}`);
  }
}

function createHarness() {
  const pool = new FakeUserPool();
  const app = createApp(pool, 'test-only-session-secret-with-more-than-thirty-two-characters');

  return { app, pool, agent: request.agent(app) };
}

const validRegistration = {
  username: 'testcustomer',
  email: 'customer@example.com',
  password: 'correct horse battery',
  confirmPassword: 'correct horse battery'
};

describe('NETCAFE authentication', () => {
  it('registers a customer and stores only a bcrypt hash', async () => {
    const { agent, pool } = createHarness();
    const response = await agent.post('/register').type('form').send(validRegistration);

    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/login');
    assert.equal(pool.users.length, 1);
    assert.equal(pool.users[0].role, 'CUSTOMER');
    assert.equal(pool.users[0].is_active, true);
    assert.notEqual(pool.users[0].password_hash, validRegistration.password);
    assert.match(pool.users[0].password_hash, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(validRegistration.password, pool.users[0].password_hash), true);
  });

  it('rejects duplicate usernames and emails', async () => {
    const { agent } = createHarness();
    await agent.post('/register').type('form').send(validRegistration);

    const duplicateUsername = await agent.post('/register').type('form').send({
      ...validRegistration,
      email: 'another@example.com'
    });
    const duplicateEmail = await agent.post('/register').type('form').send({
      ...validRegistration,
      username: 'anothercustomer'
    });

    assert.equal(duplicateUsername.status, 409);
    assert.equal(duplicateEmail.status, 409);
    assert.match(duplicateEmail.text, /Username or email is already registered/);
  });

  it('rejects invalid registration input', async () => {
    const { app } = createHarness();
    const response = await request(app).post('/register').type('form').send({
      ...validRegistration,
      email: 'not-an-email',
      confirmPassword: 'different password'
    });

    assert.equal(response.status, 400);
    assert.match(response.text, /valid email address/);
  });

  it('rejects request bodies larger than the configured limit', async () => {
    const { app } = createHarness();
    const response = await request(app)
      .post('/register')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`username=${'a'.repeat(11_000)}`);

    assert.equal(response.status, 413);
  });

  it('logs in with the correct password and sets a protected session cookie', async () => {
    const { agent, pool } = createHarness();
    await agent.post('/register').type('form').send(validRegistration);

    const response = await agent.post('/login').type('form').send({
      email: validRegistration.email,
      password: validRegistration.password
    });
    const setCookie = response.headers['set-cookie'].join('; ');
    const dashboard = await agent.get('/dashboard');

    assert.equal(response.status, 303);
    assert.equal(response.headers.location, '/dashboard');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.equal(setCookie.includes(validRegistration.password), false);
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /testcustomer/);
    assert.match(dashboard.text, /CUSTOMER/);
    assert.doesNotMatch(dashboard.text, /password_hash|correct horse battery/);
    assert.equal(pool.users[0].role, 'CUSTOMER');
  });

  it('uses the same safe error for an unknown email and a wrong password', async () => {
    const { agent, pool } = createHarness();
    pool.users.push({
      id: '1',
      username: validRegistration.username,
      email: validRegistration.email,
      password_hash: await bcrypt.hash(validRegistration.password, 4),
      role: 'CUSTOMER',
      is_active: true
    });

    const wrongPassword = await agent.post('/login').type('form').send({
      email: validRegistration.email,
      password: 'incorrect password'
    });
    const unknownEmail = await agent.post('/login').type('form').send({
      email: 'missing@example.com',
      password: 'incorrect password'
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.match(wrongPassword.text, /Email or password is incorrect/);
    assert.match(unknownEmail.text, /Email or password is incorrect/);
  });

  it('rejects login for an inactive user', async () => {
    const { agent, pool } = createHarness();
    pool.users.push({
      id: '1',
      username: validRegistration.username,
      email: validRegistration.email,
      password_hash: await bcrypt.hash(validRegistration.password, 4),
      role: 'CUSTOMER',
      is_active: false
    });

    const response = await agent.post('/login').type('form').send({
      email: validRegistration.email,
      password: validRegistration.password
    });

    assert.equal(response.status, 401);
    assert.match(response.text, /Email or password is incorrect/);
  });

  it('rate limits repeated login attempts', async () => {
    const { agent } = createHarness();
    const loginAttempt = () => agent.post('/login').type('form').send({
      email: 'invalid-email',
      password: 'incorrect password'
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await loginAttempt()).status, 401);
    }

    const limited = await loginAttempt();
    assert.equal(limited.status, 429);
    assert.match(limited.text, /Too many login attempts/);
  });

  it('protects the dashboard and destroys the session on logout', async () => {
    const { agent } = createHarness();
    const anonymousDashboard = await agent.get('/dashboard');
    await agent.post('/register').type('form').send(validRegistration);
    await agent.post('/login').type('form').send({
      email: validRegistration.email,
      password: validRegistration.password
    });
    const logout = await agent.post('/logout');
    const dashboardAfterLogout = await agent.get('/dashboard');

    assert.equal(anonymousDashboard.status, 302);
    assert.equal(anonymousDashboard.headers.location, '/login');
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.location, '/login');
    assert.match(logout.headers['set-cookie'].join('; '), /netcafe\.sid=/);
    assert.equal(dashboardAfterLogout.status, 302);
    assert.equal(dashboardAfterLogout.headers.location, '/login');
  });

  it('redirects anonymous users away from the admin dashboard', async () => {
    const { agent } = createHarness();
    const response = await agent.get('/admin/dashboard');

    assert.equal(response.status, 302);
    assert.equal(response.headers.location, '/login');
  });

  it('rejects a customer from the admin dashboard', async () => {
    const { agent } = createHarness();
    await agent.post('/register').type('form').send({
      ...validRegistration,
      role: 'ADMIN'
    });
    await agent.post('/login').type('form').send({
      email: validRegistration.email,
      password: validRegistration.password,
      role: 'ADMIN'
    });

    const response = await agent.get('/admin/dashboard?role=ADMIN');

    assert.equal(response.status, 403);
    assert.match(response.text, /Forbidden/);
  });

  it('redirects an admin to and renders the admin dashboard', async () => {
    const { agent, pool } = createHarness();
    pool.users.push({
      id: '1',
      username: 'admin',
      email: 'admin@netcafe.local',
      password_hash: await bcrypt.hash('AdminDev123!', 4),
      role: 'ADMIN',
      is_active: true
    });

    const login = await agent.post('/login').type('form').send({
      email: 'admin@netcafe.local',
      password: 'AdminDev123!'
    });
    const dashboard = await agent.get('/admin/dashboard');

    assert.equal(login.status, 303);
    assert.equal(login.headers.location, '/admin/dashboard');
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Admin Dashboard/);
    assert.match(dashboard.text, /admin@netcafe.local/);
    assert.match(dashboard.text, /ADMIN/);
  });

  it('allows an admin to use the general dashboard and blocks admin access after logout', async () => {
    const { agent, pool } = createHarness();
    pool.users.push({
      id: '1',
      username: 'admin',
      email: 'admin@netcafe.local',
      password_hash: await bcrypt.hash('AdminDev123!', 4),
      role: 'ADMIN',
      is_active: true
    });

    await agent.post('/login').type('form').send({
      email: 'admin@netcafe.local',
      password: 'AdminDev123!'
    });
    const generalDashboard = await agent.get('/dashboard');
    const logout = await agent.post('/logout');
    const adminDashboardAfterLogout = await agent.get('/admin/dashboard');

    assert.equal(generalDashboard.status, 200);
    assert.match(generalDashboard.text, /Authenticated/);
    assert.equal(logout.status, 303);
    assert.equal(adminDashboardAfterLogout.status, 302);
    assert.equal(adminDashboardAfterLogout.headers.location, '/login');
  });
});