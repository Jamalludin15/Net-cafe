import { Router } from 'express';
import { health, readiness } from '../controllers/healthController.js';
import rateLimit from 'express-rate-limit';
import { createAuthController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { createAdminRoutes } from './admin.js';
import { createCustomerRoutes } from './customer.js';
import { createComputerController } from '../controllers/computerController.js';
import { createTransactionController } from '../controllers/transactionController.js';
import { createProfileController } from '../controllers/profileController.js';

export function createRoutes(pool) {
  const router = Router();
  const auth = createAuthController(pool);
  const computers = createComputerController(pool);
  const transactions = createTransactionController(pool);
  const profile = createProfileController(pool);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(_request, response) {
      return response.status(429).render('login', {
        error: 'Too many login attempts. Please try again later.',
        email: ''
      });
    }
  });

  router.get('/', (_request, response) => response.render('home'));
  router.get('/health', health);
  router.get('/ready', readiness(pool));
  router.get('/register', auth.showRegister);
  router.post('/register', auth.register);
  router.get('/login', auth.showLogin);
  router.post('/login', loginLimiter, auth.login);
  router.post('/logout', requireAuth, auth.logout);
  router.get('/dashboard', requireAuth, auth.dashboard);
  router.get('/computers', requireAuth, computers.listCustomer);
  router.get('/transactions', requireAuth, transactions.listCustomer);
  router.get('/profile', requireAuth, profile.showProfile);
  router.get('/profile/edit', requireAuth, profile.showEdit);
  router.post('/profile/update', requireAuth, profile.updateProfile);
  router.get('/forbidden', (_request, response) => response.status(403).render('forbidden'));
  router.use('/bookings', createCustomerRoutes(pool));
  router.use('/admin', createAdminRoutes(pool));
  router.use('/customer/bookings', createCustomerRoutes(pool));

  return router;
}