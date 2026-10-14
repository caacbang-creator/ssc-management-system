// Officers: review, respond to and resolve concerns. Concerns are never deleted.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
const express = require('express');
const concernModel = require('../models/concernModel');

const router = express.Router();

const STATUSES = ['submitted', 'under_review', 'responded', 'resolved'];

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// A status change matched 0 rows: 404 if missing, otherwise refuse with a message
async function refuseOrNotFound(req, res, id, message) {
  const existing = await concernModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `/manage/concerns/${id}`);
}

router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const concerns = await concernModel.listForManage(status);
    res.render('manage/concerns/index', { title: 'Manage concerns', concerns, status });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const concern = id ? await concernModel.findById(id) : null;
    if (!concern) return notFound(res);
    res.render('manage/concerns/show', {
      title: `Concern ${concern.reference_no}`, concern, errors: [], oldResponse: ''
    });
  } catch (err) {
    next(err);
  }
});

// submitted -> under_review
router.post('/:id/review', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await concernModel.startReview(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only submitted concerns can be moved to review.');
    req.session.flash = { type: 'success', message: 'Concern is now under review.' };
    res.redirect(303, `/manage/concerns/${id}`);
  } catch (err) {
    next(err);
  }
});

// under_review -> responded (response required)
router.post('/:id/respond', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const response = String(req.body.response ?? '').trim();
    if (response === '' || response.length > 5000) {
      const concern = await concernModel.findById(id);
      if (!concern) return notFound(res);
      return res.status(422).render('manage/concerns/show', {
        title: `Concern ${concern.reference_no}`, concern, oldResponse: response,
        errors: ['A response is required (up to 5,000 characters).']
      });
    }
    const changed = await concernModel.respond(id, req.user.id, response);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only concerns under review can be responded to.');
    req.session.flash = { type: 'success', message: 'Response saved. The student can now see it.' };
    res.redirect(303, `/manage/concerns/${id}`);
  } catch (err) {
    next(err);
  }
});

// responded -> resolved
router.post('/:id/resolve', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await concernModel.resolve(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only responded concerns can be marked resolved.');
    req.session.flash = { type: 'success', message: 'Concern marked as resolved.' };
    res.redirect(303, `/manage/concerns/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
