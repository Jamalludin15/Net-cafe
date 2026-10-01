import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createCustomer, findByEmail, findDuplicate } from '../repositories/userRepository.js';

const dummyPasswordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);

export async function registerCustomer(pool, { username, email, password }) {
  if (await findDuplicate(pool, username, email)) {
    return { user: null, duplicate: true };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await createCustomer(pool, { username, email, passwordHash });
    return { user, duplicate: false };
  } catch (error) {
    if (error.code === '23505') {
      return { user: null, duplicate: true };
    }

    throw error;
  }
}

export async function authenticate(pool, email, password) {
  const user = await findByEmail(pool, email);

  const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? dummyPasswordHash);

  if (!user || !user.is_active || !passwordMatches) {
    return null;
  }

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
}