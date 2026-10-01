export function createTransactionController(pool) {
  return {
    async listCustomer(request, response, next) {
      try {
        const result = await pool.query(
          `SELECT t.id, t.booking_id, t.amount, t.status, t.transaction_type, t.created_at,
                  b.start_time, b.end_time, c.computer_code, c.name AS computer_name
           FROM transactions t
           JOIN bookings b ON b.id = t.booking_id
           JOIN computers c ON c.id = b.computer_id
           WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
          [request.session.user.userId]
        );
        return response.render('transactions', { transactions: result.rows, path: '/transactions' });
      } catch (error) {
        return next(error);
      }
    }
  };
}
