import { authenticate, registerCustomer } from '../services/authService.js';
import { validateLogin, validateRegistration } from '../validators/authValidator.js';

function renderRegister(response, { error = null, values = {} } = {}, status = 200) {
  return response.status(status).render('register', { error, values });
}

function renderLogin(response, { error = null, email = '' } = {}, status = 200) {
  return response.status(status).render('login', { error, email });
}

export function createAuthController(pool) {
  return {
    showRegister(_request, response) {
      return renderRegister(response);
    },

    async register(request, response, next) {
      const validation = validateRegistration(request.body);
      const values = {
        username: typeof request.body.username === 'string' ? request.body.username.trim() : '',
        email: typeof request.body.email === 'string' ? request.body.email.trim() : ''
      };

      if (validation.error) {
        return renderRegister(response, { error: validation.error, values }, 400);
      }

      try {
        const result = await registerCustomer(pool, validation.value);
        if (result.duplicate) {
          return renderRegister(response, {
            error: 'Username or email is already registered.',
            values
          }, 409);
        }

        return response.redirect(303, '/login');
      } catch (error) {
        return next(error);
      }
    },

    showLogin(_request, response) {
      return renderLogin(response);
    },

    async login(request, response, next) {
      const validation = validateLogin(request.body);
      if (validation.error) {
        return renderLogin(response, { error: validation.error }, 401);
      }

      try {
        const user = await authenticate(pool, validation.value.email, validation.value.password);
        if (!user) {
          return renderLogin(response, {
            error: 'Email or password is incorrect.'
          }, 401);
        }

        request.session.regenerate((error) => {
          if (error) {
            return next(error);
          }

          request.session.user = user;
          request.session.save((saveError) => {
            if (saveError) {
              return next(saveError);
            }

            const destination = user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
            return response.redirect(303, destination);
          });
        });
      } catch (error) {
        return next(error);
      }
    },

    logout(request, response, next) {
      request.session.destroy((error) => {
        response.clearCookie('netcafe.sid', {
          path: '/',
          sameSite: 'lax',
          secure: request.app.get('env') === 'production'
        });

        if (error) {
          return next(error);
        }

        return response.redirect(303, '/login');
      });
    },

    async dashboard(request, response, next) {
      try {
        const result = await pool.query(`
          SELECT
            (SELECT COUNT(*)::int FROM computers WHERE status = 'AVAILABLE' AND is_active = TRUE) AS available_computers,
            (SELECT COUNT(*)::int FROM bookings WHERE user_id = $1 AND status IN ('PENDING', 'CONFIRMED')) AS active_bookings,
            (SELECT COUNT(*)::int FROM bookings WHERE user_id = $1) AS total_bookings,
            (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600), 0)::numeric FROM bookings b WHERE b.user_id = $1 AND b.status IN ('CONFIRMED', 'COMPLETED')) AS total_usage_hours
          `, [request.session.user.userId]);
        const summary = result.rows[0] ?? {};
        return response.render('dashboard', { user: request.session.user, summary, path: '/dashboard' });
      } catch (error) {
        return next(error);
      }
    }
  };
}