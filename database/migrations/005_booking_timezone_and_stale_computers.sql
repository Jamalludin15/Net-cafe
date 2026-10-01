-- Older datetime-local inputs were interpreted in the UTC container timezone instead of WIB.
UPDATE bookings
SET start_time = start_time - INTERVAL '7 hours',
    end_time = end_time - INTERVAL '7 hours',
    updated_at = NOW();

UPDATE computers c
SET status = 'AVAILABLE', updated_at = NOW()
WHERE c.status = 'IN_USE'
  AND NOT EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.computer_id = c.id AND s.status = 'ACTIVE'
  );