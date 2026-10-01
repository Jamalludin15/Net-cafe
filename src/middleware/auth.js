export function requireAuth(request, response, next) {
  if (!request.session?.user) {
    return response.redirect('/login');
  }

  return next();
}

export function requireRole(role) {
  return (request, response, next) => {
    if (!request.session?.user) {
      return response.redirect('/login');
    }

    if (request.session.user.role !== role) {
      return response.sendStatus(403);
    }

    return next();
  };
}