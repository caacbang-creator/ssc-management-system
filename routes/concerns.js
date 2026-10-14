// Student-facing concerns: submit (login), my concerns (owner only), public tracking
const express = require('express');
const concernModel = require('../models/concernModel');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const CATEGORIES = ['academic', 'facilities', 'student_services', 'other'];
const REFERENCE_PATTERN = /^C-\d{4}-\d{4,}$/;

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

// ---------- Hub page (public) ----------
router.get('/', (req, res) => {
  res.render('concerns/index', { title: 'Concerns' });
});

// ---------- Submit (login required) ----------
router.get('/new', requireLogin, (req, res) => {
  res.render('concerns/new', { title: 'Submit a concern', categories: CATEGORIES, errors: [], old: {} });
});

router.post('/', requireLogin, async (req, res, next) => {
  try {
    const old = {
      category: String(req.body.category ?? '').trim(),
      subject: String(req.body.subject ?? '').trim(),
      message: String(req.body.message ?? '').trim(),
      anonymous: req.body.anonymous === '1'
    };
    const errors = [];
    if (!CATEGORIES.includes(old.category)) {
      errors.push('Choose a category from the list.');
    }
    if (old.subject === '' || old.subject.length > 150) {
      errors.push('Subject is required (up to 150 characters).');
    }
    if (old.message === '' || old.message.length > 5000) {
      errors.push('Message is required (up to 5,000 characters).');
    }
    if (errors.length > 0) {
      return res.status(422).render('concerns/new', {
        title: 'Submit a concern', categories: CATEGORIES, errors, old
      });
    }

    // Anonymous: the concern is saved WITHOUT the user's id
    const userId = old.anonymous ? null : req.user.id;
    const referenceNo = await concernModel.create(old, userId);

    req.session.flash = {
      type: 'success',
      message: old.anonymous
        ? `Anonymous concern submitted. Your reference number is ${referenceNo}. Write it down: it is the ONLY way to track this concern.`
        : `Concern submitted. Your reference number is ${referenceNo}.`
    };
    res.redirect(303, old.anonymous ? `/concerns/track?ref=${encodeURIComponent(referenceNo)}` : '/concerns/my');
  } catch (err) {
    next(err);
  }
});

// ---------- My concerns (named concerns only) ----------
router.get('/my', requireLogin, async (req, res, next) => {
  try {
    const concerns = await concernModel.listForUser(req.user.id);
    res.render('concerns/my', { title: 'My concerns', concerns });
  } catch (err) {
    next(err);
  }
});

// ---------- Public tracking: status and response only ----------
router.get('/track', async (req, res, next) => {
  try {
    const ref = String(req.query.ref ?? '').trim().toUpperCase();
    if (ref === '') {
      return res.render('concerns/track', { title: 'Track a concern', ref, concern: null, errors: [] });
    }
    if (!REFERENCE_PATTERN.test(ref)) {
      return res.status(422).render('concerns/track', {
        title: 'Track a concern', ref, concern: null,
        errors: ['Enter a reference number like C-2026-0001.']
      });
    }
    const concern = await concernModel.findForTracking(ref);
    if (!concern) {
      return res.status(404).render('concerns/track', {
        title: 'Track a concern', ref, concern: null,
        errors: ['No concern was found with that reference number.']
      });
    }
    res.render('concerns/track', { title: 'Track a concern', ref, concern, errors: [] });
  } catch (err) {
    next(err);
  }
});

// ---------- One of my concerns (owner only) ----------
router.get('/:id', requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    // Someone else's concern (or an anonymous one) is "not found" - never "forbidden"
    const concern = id ? await concernModel.findOwn(id, req.user.id) : null;
    if (!concern) {
      return res.status(404).render('errors/404', { title: 'Page not found' });
    }
    res.render('concerns/show', { title: `Concern ${concern.reference_no}`, concern });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
