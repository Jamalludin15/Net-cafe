const COMPUTER_STATUSES = new Set(['AVAILABLE', 'IN_USE', 'MAINTENANCE']);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateComputerInput(input = {}, { partial = false } = {}) {
  const code = text(input.computer_code ?? input.code);
  const name = text(input.name);
  const hourlyRate = text(input.hourly_rate ?? input.hourlyRate);
  const status = text(input.status).toUpperCase();
  const activeValue = Array.isArray(input.is_active) ? input.is_active[input.is_active.length - 1] : input.is_active;
  const isActive = activeValue === undefined ? true : activeValue === true || activeValue === 'true' || activeValue === 'on';

  if (!partial || code) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,29}$/.test(code)) {
      return { error: 'Computer code must be 2-30 characters using letters, numbers, dot, dash, or underscore.' };
    }
  }
  if (!partial || name) {
    if (name.length < 2 || name.length > 100) {
      return { error: 'Computer name must be 2-100 characters.' };
    }
  }
  if (!partial || hourlyRate) {
    const rate = Number(hourlyRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 99999999.99) {
      return { error: 'Hourly rate must be a valid non-negative number.' };
    }
  }
  if (!partial || status) {
    if (!COMPUTER_STATUSES.has(status)) {
      return { error: 'Computer status is invalid.' };
    }
  }

  return {
    value: {
      code: code || undefined,
      name: name || undefined,
      hourlyRate: hourlyRate ? Number(hourlyRate) : undefined,
      status: status || undefined,
      isActive
    }
  };
}

export { COMPUTER_STATUSES };
