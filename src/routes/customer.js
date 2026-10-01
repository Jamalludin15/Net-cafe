import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createBookingController } from '../controllers/bookingController.js';
import { createTransactionController } from '../controllers/transactionController.js';
import { createProfileController } from '../controllers/profileController.js';

export function createCustomerRoutes(pool) {
  const router = Router();
  const bookings = createBookingController(pool);
  const transactions = createTransactionController(pool);
  const profile = createProfileController(pool);

  router.use(requireAuth);
  router.use(requireRole('CUSTOMER'));
  router.get('/transactions', transactions.listCustomer);
  router.get('/profile', profile.showProfile);
  router.get('/profile/edit', profile.showEdit);
  router.post('/profile/update', profile.updateProfile);
  router.get('/new', bookings.showNew);
  router.post('/', bookings.create);
  router.get('/', bookings.listCustomer);
  router.get('/:id', bookings.detail);
  router.post('/:id/cancel', bookings.cancel);

  return router;
}
