import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('NETCAFE HTTP foundation', () => {
  const app = createApp({
    query: async () => ({ rows: [{ '?column?': 1 }] })
  }, 'test-only-session-secret-with-more-than-thirty-two-characters');

  it('renders the home page', async () => {
    const response = await request(app).get('/');

    assert.equal(response.status, 200);
    assert.match(response.text, /NETCAFE/);
    assert.match(response.text, /Internet Cafe/);
  });

  it('returns the health response', async () => {
    const response = await request(app).get('/health');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok', service: 'netcafe-app' });
  });

  it('returns ready when the database query succeeds', async () => {
    const response = await request(app).get('/ready');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ready', database: 'connected' });
  });

  it('returns a safe 503 response when the database is unavailable', async () => {
    const unavailableApp = createApp({
      query: async () => { throw new Error('secret database details'); }
    }, 'test-only-session-secret-with-more-than-thirty-two-characters');
    const response = await request(unavailableApp).get('/ready');

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: 'not_ready', database: 'disconnected' });
    assert.doesNotMatch(response.text, /secret database details/);
  });
});