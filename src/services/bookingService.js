import {
  cancelBookingForUser,
  createBooking,
  findAvailableComputerForUpdate,
  findBookingById,
  hasBookingOverlap,
  listAllBookings,
  listBookingsForUser,
  updateBookingStatus
} from '../repositories/bookingRepository.js';
import { findComputerById } from '../repositories/computerRepository.js';
import { calculateBookingTotal } from '../validators/bookingValidator.js';

export class BookingConflictError extends Error {}
export class ComputerUnavailableError extends Error {}

export async function createCustomerBooking(pool, { userId, computerId, startTime, endTime }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const computer = await findAvailableComputerForUpdate(client, computerId);
    if (!computer || !computer.is_active || computer.status !== 'AVAILABLE') {
      throw new ComputerUnavailableError('Computer is not available for booking.');
    }
    if (await hasBookingOverlap(client, computerId, startTime, endTime)) {
      throw new BookingConflictError('The booking time overlaps an existing booking.');
    }
    const booking = await createBooking(client, { userId, computerId, startTime, endTime });
    await client.query('COMMIT');
    return { ...booking, hourly_rate: computer.hourly_rate, total: calculateBookingTotal(computer.hourly_rate, startTime, endTime) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getCustomerBookings(pool, userId) {
  const bookings = await listBookingsForUser(pool, userId);
  return bookings.map((booking) => ({
    ...booking,
    total: calculateBookingTotal(booking.hourly_rate, booking.start_time, booking.end_time)
  }));
}

export async function getAdminBookings(pool, filters) {
  const bookings = await listAllBookings(pool, filters);
  return bookings.map((booking) => ({
    ...booking,
    total: calculateBookingTotal(booking.hourly_rate, booking.start_time, booking.end_time)
  }));
}

export async function getBooking(pool, bookingId) {
  const booking = await findBookingById(pool, bookingId);
  return booking ? { ...booking, total: calculateBookingTotal(booking.hourly_rate, booking.start_time, booking.end_time) } : null;
}

export async function cancelCustomerBooking(pool, bookingId, userId) {
  const booking = await findBookingById(pool, bookingId);
  if (!booking) return { status: 'missing' };
  if (String(booking.user_id) !== String(userId)) return { status: 'forbidden' };
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) return { status: 'invalid' };
  await cancelBookingForUser(pool, bookingId, userId);
  return { status: 'cancelled' };
}

export async function updateAdminBookingStatus(pool, bookingId, status) {
  return updateBookingStatus(pool, bookingId, status);
}

export { findComputerById };
