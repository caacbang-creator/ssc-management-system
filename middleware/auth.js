// Login and role checks
const userModel = require('../models/userModel');

// Runs on every request. Loads the logged-in user FRESH from the database,
// so a role change (e.g. an approved officer request) applies immediately.
async function loadUser(req, res, next) {
  req.user = null;
  res.locals.currentUser = null;
  try {
    if (req.session.userId) {
      const user = await userModel.findById(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.currentUser = user;
      } else {
        // The account no longer exists: forget it
        delete req.session.userId;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Not logged in -> send to the login page
function requireLogin(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  next();
}

// Logged in but the wrong role -> 403 Forbidden
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      req.session.flash = { type: 'error', message: 'Please log in to continue.' };
      return res.redirect('/login');
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('errors/403', { title: 'Access denied' });
    }
    next();
  };
}

// Any officer: every role except student (office check-in, C25). Use after requireLogin.
function requireOfficer(req, res, next) {
  if (!req.user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  if (req.user.role === 'student') {
    return res.status(403).render('errors/403', { title: 'Access denied' });
  }
  next();
}

module.exports = { loadUser, requireLogin, requireRole, requireOfficer };
