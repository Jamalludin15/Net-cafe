import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createBookingController } from '../controllers/bookingController.js';
import { createComputerController } from '../controllers/computerController.js';
import { createAdminController } from '../controllers/adminController.js';

export function createAdminRoutes(pool) {
  const router = Router();
  const computers = createComputerController(pool);
  const bookings = createBookingController(pool);
  const admin = createAdminController(pool);

  router.use(requireAuth);
  router.use(requireRole('ADMIN'));
  router.get('/dashboard', admin.dashboard);
  router.get('/customers', admin.listCustomers);
  router.get('/customers/:id', admin.customerDetail);
  router.get('/customers/:id/edit', admin.showCustomerEdit);
  router.post('/customers/:id/update', admin.updateCustomer);
  router.get('/computers', computers.listAdmin);
  router.get('/computers/new', computers.showNew);
  router.post('/computers', computers.create);
  router.get('/computers/:id/edit', computers.showEdit);
  router.post('/computers/:id/update', computers.update);
  router.get('/bookings', bookings.listAdmin);
  router.post('/bookings/:id/status', bookings.updateStatus);
  router.get('/sessions', admin.listSessions);
  router.post('/sessions/start', admin.startSession);
  router.post('/sessions/:id/end', admin.endSession);
  router.get('/transactions', admin.listTransactions);
  router.get('/transactions/:id', admin.detailTransaction);
  router.post('/transactions/:id/complete', admin.completeTransaction);
  router.get('/reports', admin.showReports);
  router.get('/accounts', admin.listAccounts);
  router.get('/accounts/new', admin.showAccountForm);
  router.post('/accounts', admin.createAccount);

  return router;
}
