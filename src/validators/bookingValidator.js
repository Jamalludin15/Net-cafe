const JAKARTA_OFFSET_MINUTES = 7 * 60;

function parseBookingDateTime(value) {
  const localDateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!localDateTime) return new Date(value);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', millisecondText = '0'] = localDateTime;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const milliseconds = Number(millisecondText.padEnd(3, '0'));
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const check = new Date(localTimestamp);

  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) {
    return new Date(Number.NaN);
  }

  return new Date(localTimestamp - JAKARTA_OFFSET_MINUTES * 60 * 1000);
}

export function validateBookingInput(input = {}) {
  const computerId = Number.parseInt(input.computer_id ?? input.computerId, 10);
  const startTime = typeof input.start_time === 'string' ? input.start_time.trim() : '';
  const endTime = typeof input.end_time === 'string' ? input.end_time.trim() : '';
  const start = parseBookingDateTime(startTime);
  const end = parseBookingDateTime(endTime);

  if (!Number.isSafeInteger(computerId) || computerId < 1) {
    return { error: 'A valid computer is required.' };
  }
  if (!startTime || Number.isNaN(start.getTime()) || !endTime || Number.isNaN(end.getTime())) {
    return { error: 'Start and end times must be valid.' };
  }
  if (end <= start) {
    return { error: 'End time must be after start time.' };
  }
  if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) {
    return { error: 'A booking cannot be longer than 24 hours.' };
  }

  return { value: { computerId, startTime: start.toISOString(), endTime: end.toISOString() } };
}

export function calculateBookingTotal(hourlyRate, startTime, endTime) {
  const durationHours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / (60 * 60 * 1000);
  return Number((Number(hourlyRate) * durationHours).toFixed(2));
}
