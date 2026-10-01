import bcrypt from 'bcryptjs';
import {
  createAdminUser,
  findDuplicate,
  findByEmail,
  findById,
  getAdminDashboardSummary,
  getAdminTransactions,
  getCustomerUsageSummary,
  listAdminUsers,
  listUsers,
  updateCustomerAdmin,
  countCustomerBookings,
  countCustomerTransactions
} from '../repositories/userRepository.js';
import {
  endSessionById,
  completePendingTransaction,
  findBookingById,
  listBookingsReadyForSession,
  listReportsData,
  listSessionsForAdmin,
  startSessionForBooking
} from '../repositories/sessionRepository.js';
import { validateRegistration } from '../validators/authValidator.js';

export function createAdminController(pool) {
  return {
    async dashboard(request, response, next) {
      try {
        const summary = await getAdminDashboardSummary(pool);
        return response.render('admin/dashboard', { user: request.session.user, summary, path: '/admin/dashboard' });
      } catch (error) {
        return next(error);
      }
    },

    async listCustomers(_request, response, next) {
      try {
        const users = await listUsers(pool, 'CUSTOMER');
        return response.render('admin/customers', { users, title: 'Pelanggan', path: '/admin/customers' });
      } catch (error) {
        return next(error);
      }
    },

    async customerDetail(request, response, next) {
      try {
        const user = await findById(pool, request.params.id);
        if (!user || user.role !== 'CUSTOMER') return response.sendStatus(404);
        const bookingCount = await countCustomerBookings(pool, user.id);
        const transactionCount = await countCustomerTransactions(pool, user.id);
        const usageSummary = await getCustomerUsageSummary(pool, user.id);
        return response.render('admin/customer-detail', { user, bookingCount, transactionCount, usageSummary, path: '/admin/customers' });
      } catch (error) {
        return next(error);
      }
    },

    async showCustomerEdit(request, response, next) {
      try {
        const user = await findById(pool, request.params.id);
        if (!user || user.role !== 'CUSTOMER') return response.sendStatus(404);
        return response.render('admin/customer-form', { user, error: null, path: '/admin/customers' });
      } catch (error) {
        return next(error);
      }
    },

    async updateCustomer(request, response, next) {
      try {
        const user = await findById(pool, request.params.id);
        if (!user || user.role !== 'CUSTOMER') return response.sendStatus(404);
        const email = typeof request.body.email === 'string' ? request.body.email.trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return response.status(400).render('admin/customer-form', { user: { ...user, email }, error: 'Email is invalid.', path: '/admin/customers' });
        }

        const duplicate = await findByEmail(pool, email);
        if (duplicate && String(duplicate.id) !== String(request.params.id)) {
          return response.status(409).render('admin/customer-form', { user: { ...user, email }, error: 'Email is already in use.', path: '/admin/customers' });
        }

        const updated = await updateCustomerAdmin(pool, request.params.id, {
          email,
          isActive: request.body.is_active === 'on' || request.body.is_active === 'true'
        });
        if (!updated) return response.sendStatus(404);
        return response.redirect(303, `/admin/customers/${request.params.id}`);
      } catch (error) {
        return next(error);
      }
    },

    async listSessions(_request, response, next) {
      try {
        const sessions = await listSessionsForAdmin(pool);
        const bookings = await listBookingsReadyForSession(pool);
        return response.render('admin/sessions', { sessions, bookings, path: '/admin/sessions' });
      } catch (error) {
        return next(error);
      }
    },

    async startSession(request, response, next) {
      try {
        if (!/^\d+$/.test(String(request.body.booking_id ?? ''))) {
          return response.status(400).send('Invalid booking ID.');
        }
        const bookingId = Number.parseInt(request.body.booking_id, 10);
        const booking = await findBookingById(pool, bookingId);
        if (!booking) return response.status(404).send('Booking not found.');
        const session = await startSessionForBooking(pool, {
          bookingId: booking.id,
          userId: booking.user_id,
          computerId: booking.computer_id
        });
        if (!session) return response.status(409).send('Booking is not eligible for a session now.');
        return response.redirect(303, '/admin/sessions');
      } catch (error) {
        return next(error);
      }
    },

    async endSession(request, response, next) {
      try {
        const session = await endSessionById(pool, request.params.id);
        if (!session) return response.sendStatus(404);
        return response.redirect(303, '/admin/sessions');
      } catch (error) {
        return next(error);
      }
    },

    async listTransactions(_request, response, next) {
      try {
        const transactions = await getAdminTransactions(pool);
        return response.render('admin/transactions', { transactions, path: '/admin/transactions' });
      } catch (error) {
        return next(error);
      }
    },

    async detailTransaction(request, response, next) {
      try {
        const transaction = await findTransactionById(pool, request.params.id);
        if (!transaction) return response.sendStatus(404);
        return response.render('admin/transaction-detail', { transaction, path: '/admin/transactions' });
      } catch (error) {
        return next(error);
      }
    },

    async completeTransaction(request, response, next) {
      try {
        if (!/^\d+$/.test(String(request.params.id))) return response.sendStatus(400);
        const transaction = await completePendingTransaction(pool, request.params.id);
        if (!transaction) return response.status(409).send('Transaction is not pending.');
        return response.redirect(303, '/admin/transactions');
      } catch (error) {
        return next(error);
      }
    },

    async showReports(_request, response, next) {
      try {
        const stats = await listReportsData(pool);
        return response.render('admin/reports', { stats, path: '/admin/reports' });
      } catch (error) {
        return next(error);
      }
    },

    async listAccounts(_request, response, next) {
      try {
        const users = await listAdminUsers(pool);
        return response.render('admin/accounts', { users, path: '/admin/accounts' });
      } catch (error) {
        return next(error);
      }
    },

    async showAccountForm(_request, response) {
      return response.render('admin/account-form', { error: null, values: {}, path: '/admin/accounts' });
    },

    async createAccount(request, response, next) {
      try {
        const username = typeof request.body.username === 'string' ? request.body.username.trim() : '';
        const email = typeof request.body.email === 'string' ? request.body.email.trim() : '';
        const password = typeof request.body.password === 'string' ? request.body.password : '';
        const validation = validateRegistration({ username, email, password, confirmPassword: password });
        if (validation.error) {
          return response.status(400).render('admin/account-form', {
            error: validation.error,
            values: { username, email },
            path: '/admin/accounts'
          });
        }
        if (await findDuplicate(pool, validation.value.username, validation.value.email)) {
          return response.status(409).render('admin/account-form', {
            error: 'Username or email is already registered.',
            values: { username, email },
            path: '/admin/accounts'
          });
        }
        const passwordHash = await bcrypt.hash(validation.value.password, 12);
        await createAdminUser(pool, { ...validation.value, passwordHash });
        return response.redirect(303, '/admin/accounts');
      } catch (error) {
        return next(error);
      }
    }
  };
}

export async function findTransactionById(pool, id) {
  const result = await pool.query(
    `SELECT t.*, u.username, u.email, b.user_id, b.start_time, b.end_time, c.computer_code, c.name AS computer_name
     FROM transactions t
     LEFT JOIN users u ON u.id = t.user_id
     LEFT JOIN bookings b ON b.id = t.booking_id
     LEFT JOIN computers c ON c.id = b.computer_id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
