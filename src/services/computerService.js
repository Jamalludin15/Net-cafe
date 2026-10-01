import { createComputer, listActiveComputers, listComputers, updateComputer } from '../repositories/computerRepository.js';

export async function getActiveComputers(pool) {
  return listActiveComputers(pool);
}

export async function getAllComputers(pool) {
  return listComputers(pool);
}

export async function addComputer(pool, input) {
  try {
    return await createComputer(pool, input);
  } catch (error) {
    if (error.code === '23505') {
      return { duplicate: true };
    }
    throw error;
  }
}

export async function editComputer(pool, id, input) {
  return updateComputer(pool, id, input);
}
