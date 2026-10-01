export function createProfileController(pool) {
  return {
    async showProfile(request, response, next) {
      try {
        const result = await pool.query(
          `SELECT id, username, email, role, is_active, created_at FROM users WHERE id = $1`,
          [request.session.user.userId]
        );
        const user = result.rows[0];
        if (!user) return response.sendStatus(404);
        return response.render('profile', { user, path: '/profile' });
      } catch (error) {
        return next(error);
      }
    },

    async showEdit(request, response, next) {
      try {
        const result = await pool.query(
          `SELECT id, username, email, role, is_active, created_at FROM users WHERE id = $1`,
          [request.session.user.userId]
        );
        const user = result.rows[0];
        if (!user) return response.sendStatus(404);
        return response.render('profile-edit', { user, error: null, path: '/profile' });
      } catch (error) {
        return next(error);
      }
    },

    async updateProfile(request, response, next) {
      try {
        const email = typeof request.body.email === 'string' ? request.body.email.trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return response.status(400).render('profile-edit', { user: { id: request.session.user.userId, email }, error: 'Email is invalid.', path: '/profile' });
        }
        const existing = await pool.query(
          `SELECT id FROM users WHERE lower(email) = lower($1) AND id != $2 LIMIT 1`,
          [email, request.session.user.userId]
        );
        if (existing.rows[0]) {
          return response.status(409).render('profile-edit', { user: { id: request.session.user.userId, email }, error: 'Email is already in use.', path: '/profile' });
        }
        await pool.query(
          `UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`,
          [email, request.session.user.userId]
        );
        return response.redirect(303, '/profile');
      } catch (error) {
        return next(error);
      }
    }
  };
}
