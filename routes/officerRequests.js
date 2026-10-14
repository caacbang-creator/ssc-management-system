// President: approve or reject officer role requests.
// Protected at the mount in app.js with requireRole('president').
const express = require('express');
const userModel = require('../models/userModel');

const router = express.Router();

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

router.get('/', async (req, res, next) => {
  try {
    const requests = await userModel.listPendingRequests();
    res.render('manage/officer-requests/index', { title: 'Officer role requests', requests });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const changed = id ? await userModel.approveRequest(id) : 0;
    if (changed === 0) {
      return res.status(404).render('errors/404', { title: 'Page not found' });
    }
    req.session.flash = { type: 'success', message: 'Officer role approved.' };
    res.redirect(303, '/manage/officer-requests');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const changed = id ? await userModel.rejectRequest(id) : 0;
    if (changed === 0) {
      return res.status(404).render('errors/404', { title: 'Page not found' });
    }
    req.session.flash = { type: 'success', message: 'Officer role request rejected. The user stays a student.' };
    res.redirect(303, '/manage/officer-requests');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
