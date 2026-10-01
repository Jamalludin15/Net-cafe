import { findComputerById } from '../repositories/computerRepository.js';
import {
  BookingConflictError,
  ComputerUnavailableError,
  cancelCustomerBooking,
  createCustomerBooking,
  getAdminBookings,
  getBooking,
  getCustomerBookings,
  updateAdminBookingStatus
} from '../services/bookingService.js';
import { validateBookingInput } from '../validators/bookingValidator.js';

const BOOKING_STATUSES = new Set(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']);

function bookingForm(response, data, status = 200) {
  return response.status(status).render('bookings/new', data);
}

export function createBookingController(pool) {
  return {
    async showNew(request, response, next) {
      try {
        if (!/^\d+$/.test(String(request.query.computer_id ?? ''))) return response.sendStatus(400);
        const computer = await findComputerById(pool, request.query.computer_id);
        if (!computer || !computer.is_active) return response.sendStatus(404);
        return bookingForm(response, { computer, error: null, values: { computer_id: computer.id } });
      } catch (error) {
        return next(error);
      }
    },

    async create(request, response, next) {
      const validation = validateBookingInput(request.body);
      if (validation.error) return bookingForm(response, { computer: { id: request.body.computer_id }, error: validation.error, values: request.body }, 400);
      try {
        await createCustomerBooking(pool, { userId: request.session.user.userId, ...validation.value });
        return response.redirect(303, '/bookings');
      } catch (error) {
        if (error instanceof ComputerUnavailableError || error instanceof BookingConflictError) {
          return bookingForm(response, { computer: { id: request.body.computer_id }, error: error.message, values: request.body }, 409);
        }
        return next(error);
      }
    },

    async listCustomer(request, response, next) {
      try {
        return response.render('bookings/index', { bookings: await getCustomerBookings(pool, request.session.user.userId), admin: false });
      } catch (error) {
        return next(error);
      }
    },

    async cancel(request, response, next) {
      try {
        const result = await cancelCustomerBooking(pool, request.params.id, request.session.user.userId);
        if (result.status === 'forbidden') return response.sendStatus(403);
        if (result.status === 'missing') return response.sendStatus(404);
        if (result.status === 'invalid') return response.status(409).send('Booking cannot be cancelled.');
        return response.redirect(303, '/bookings');
      } catch (error) {
        return next(error);
      }
    },

    async listAdmin(request, response, next) {
      const status = typeof request.query.status === 'string' && BOOKING_STATUSES.has(request.query.status) ? request.query.status : '';
      const computerId = Number.parseInt(request.query.computer_id, 10) || undefined;
      try {
        return response.render('admin/bookings', { bookings: await getAdminBookings(pool, { status, computerId }), status, computerId });
      } catch (error) {
        return next(error);
      }
    },

    async updateStatus(request, response, next) {
      const status = typeof request.body.status === 'string' ? request.body.status : '';
      if (!BOOKING_STATUSES.has(status)) return response.status(400).send('Invalid booking status.');
      try {
        const booking = await updateAdminBookingStatus(pool, request.params.id, status);
        if (!booking) return response.sendStatus(404);
        return response.redirect(303, '/admin/bookings');
      } catch (error) {
        return next(error);
      }
    },

    async detail(request, response, next) {
      try {
        const booking = await getBooking(pool, request.params.id);
        if (!booking) return response.sendStatus(404);
        if (String(booking.user_id) !== String(request.session.user.userId)) return response.sendStatus(403);
        return response.render('bookings/detail', { booking });
      } catch (error) {
        return next(error);
      }
    }
  };
}
