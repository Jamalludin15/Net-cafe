import { addComputer, editComputer, getActiveComputers, getAllComputers } from '../services/computerService.js';
import { findComputerById } from '../repositories/computerRepository.js';
import { validateComputerInput } from '../validators/computerValidator.js';

function renderForm(response, data, status = 200) {
  return response.status(status).render('admin/computer-form', data);
}

export function createComputerController(pool) {
  return {
    async listCustomer(_request, response, next) {
      try {
        return response.render('computers', { computers: await getActiveComputers(pool) });
      } catch (error) {
        return next(error);
      }
    },

    async listAdmin(_request, response, next) {
      try {
        return response.render('admin/computers', { computers: await getAllComputers(pool) });
      } catch (error) {
        return next(error);
      }
    },

    showNew(_request, response) {
      return renderForm(response, { error: null, computer: {}, action: '/admin/computers' });
    },

    async create(request, response, next) {
      const validation = validateComputerInput(request.body);
      if (validation.error) return renderForm(response, { error: validation.error, computer: request.body, action: '/admin/computers' }, 400);
      try {
        const result = await addComputer(pool, validation.value);
        if (result.duplicate) return renderForm(response, { error: 'Computer code is already registered.', computer: request.body, action: '/admin/computers' }, 409);
        return response.redirect(303, '/admin/computers');
      } catch (error) {
        return next(error);
      }
    },

    async showEdit(request, response, next) {
      try {
        const computer = await findComputerById(pool, request.params.id);
        if (!computer) return response.sendStatus(404);
        return renderForm(response, { error: null, computer, action: `/admin/computers/${computer.id}/update` });
      } catch (error) {
        return next(error);
      }
    },

    async update(request, response, next) {
      const validation = validateComputerInput(request.body);
      if (validation.error) return renderForm(response, { error: validation.error, computer: { ...request.body, id: request.params.id }, action: `/admin/computers/${request.params.id}/update` }, 400);
      try {
        const computer = await editComputer(pool, request.params.id, validation.value);
        if (!computer) return response.sendStatus(404);
        return response.redirect(303, '/admin/computers');
      } catch (error) {
        return next(error);
      }
    }
  };
}
