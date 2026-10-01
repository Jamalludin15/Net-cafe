CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_time_range_idx ON bookings(computer_id, start_time, end_time);
