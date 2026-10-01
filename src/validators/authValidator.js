const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9_.-]+$/;

export function validateRegistration(input = {}) {
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

  if (username.length < 3 || username.length > 50 || !usernamePattern.test(username)) {
    return { error: 'Username must be 3-50 characters using letters, numbers, dot, dash, or underscore.' };
  }
  if (email.length > 254 || !emailPattern.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    return { error: 'Password must be at least 12 characters and no more than 72 bytes.' };
  }
  if (password !== confirmPassword) {
    return { error: 'Password and confirmation do not match.' };
  }

  return { value: { username, email, password } };
}

export function validateLogin(input = {}) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (email.length > 254 || !emailPattern.test(email) || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return { error: 'Email or password is incorrect.' };
  }

  return { value: { email, password } };
}