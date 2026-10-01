export function health(_request, response) {
  response.json({ status: 'ok', service: 'netcafe-app' });
}

export function readiness(pool) {
  return async (_request, response) => {
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ready', database: 'connected' });
    } catch {
      response.status(503).json({ status: 'not_ready', database: 'disconnected' });
    }
  };
}