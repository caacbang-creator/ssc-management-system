// Registration, login and logout
const express = require('express');
const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

const router = express.Router();

const EMAIL_PATTERN = /^[a-z0-9._%+-]+@my\.cspc\.edu\.ph$/;
const STUDENT_NO_PATTERN = /^[A-Za-z0-9-]{4,20}$/;
// Roles a student may request at registration (never president)
const REQUESTABLE_ROLES = ['pro', 'vp_internal', 'treasurer', 'secretary'];

// Already logged in? Login and register pages are not needed.
function redirectIfLoggedIn(req, res, next) {
  if (req.user) {
    return res.redirect('/dashboard');
  }
  next();
}

// ---------- Register ----------
router.get('/register', redirectIfLoggedIn, (req, res) => {
  res.render('auth/register', { title: 'Create an account', errors: [], old: {} });
});

router.post('/register', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const old = {
      studentNo: String(req.body.studentNo ?? '').trim(),
      firstName: String(req.body.firstName ?? '').trim(),
      lastName: String(req.body.lastName ?? '').trim(),
      email: String(req.body.email ?? '').trim().toLowerCase(),
      requestedRole: String(req.body.requestedRole ?? '').trim()
    };
    // Passwords are NOT trimmed and NOT sent back to the form
    const password = String(req.body.password ?? '');
    const confirmPassword = String(req.body.confirmPassword ?? '');

    const errors = [];
    if (!STUDENT_NO_PATTERN.test(old.studentNo)) {
      errors.push('Student number is required (4-20 letters, numbers or hyphens).');
    }
    if (old.firstName === '' || old.firstName.length > 60) {
      errors.push('First name is required (up to 60 characters).');
    }
    if (old.lastName === '' || old.lastName.length > 60) {
      errors.push('Last name is required (up to 60 characters).');
    }
    if (old.email.length > 120 || !EMAIL_PATTERN.test(old.email)) {
      errors.push('Use your CSPC student e-mail (ending in @my.cspc.edu.ph).');
    }
    // bcrypt only uses the first 72 bytes, so longer passwords are refused
    if (password.length < 8 || Buffer.byteLength(password) > 72) {
      errors.push('Password must be 8 to 72 characters.');
    }
    if (password !== confirmPassword) {
      errors.push('Passwords do not match.');
    }
    if (old.requestedRole !== '' && !REQUESTABLE_ROLES.includes(old.requestedRole)) {
      errors.push('Choose a valid officer role.');
    }

    if (errors.length === 0) {
      const duplicates = await userModel.findDuplicate(old.studentNo, old.email);
      if (duplicates.some((u) => u.student_no === old.studentNo)) {
        errors.push('That student number is already registered.');
      }
      if (duplicates.some((u) => u.email === old.email)) {
        errors.push('That e-mail is already registered.');
      }
    }

    if (errors.length > 0) {
      return res.status(422).render('auth/register', { title: 'Create an account', errors, old });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await userModel.create({
        studentNo: old.studentNo,
        firstName: old.firstName,
        lastName: old.lastName,
        email: old.email,
        passwordHash,
        requestedRole: old.requestedRole || null
      });
    } catch (err) {
      // Two sign-ups at the same moment: the UNIQUE key is the final check
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(422).render('auth/register', {
          title: 'Create an account',
          errors: ['That student number or e-mail is already registered.'],
          old
        });
      }
      throw err;
    }

    req.session.flash = {
      type: 'success',
      message: old.requestedRole
        ? 'Account created. Your officer role request is waiting for the President. You can log in as a student now.'
        : 'Account created. You can log in now.'
    };
    res.redirect(303, '/login');
  } catch (err) {
    next(err);
  }
});

// ---------- Login ----------
router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('auth/login', { title: 'Log in', errors: [], old: {} });
});

router.post('/login', redirectIfLoggedIn, async (req, res, next) => {
  try {
    const old = { email: String(req.body.email ?? '').trim().toLowerCase() };
    const password = String(req.body.password ?? '');

    if (old.email === '' || password === '') {
      return res.status(422).render('auth/login', {
        title: 'Log in',
        errors: ['Enter your e-mail and password.'],
        old
      });
    }

    const user = await userModel.findByEmailForLogin(old.email);
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;

    // Same message for "no such e-mail" and "wrong password"
    if (!passwordOk) {
      return res.status(401).render('auth/login', {
        title: 'Log in',
        errors: ['Incorrect e-mail or password.'],
        old
      });
    }

    // New session id on login prevents session fixation
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.flash = { type: 'success', message: 'You are now logged in.' };
      res.redirect(303, '/dashboard');
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Logout (POST, because it changes state) ----------
router.post('/logout', (req, res, next) => {
  // regenerate() throws away all session data, including userId
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.flash = { type: 'success', message: 'You have been logged out.' };
    res.redirect(303, '/');
  });
});

module.exports = router;
