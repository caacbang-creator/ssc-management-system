// Public event pages, plus student registration (login required)
const express = require('express');
const eventModel = require('../models/eventModel');
const eventPhotoModel = require('../models/eventPhotoModel');
const eventVideoModel = require('../models/eventVideoModel');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

router.get('/', async (req, res, next) => {
  try {
    const upcoming = await eventModel.listUpcoming();
    const completed = await eventModel.listCompleted();
    res.render('events/index', { title: 'Events', upcoming, completed });
  } catch (err) {
    next(err);
  }
});

// Must come before '/:id' so 'my-registrations' is not read as an id
router.get('/my-registrations', requireLogin, async (req, res, next) => {
  try {
    const registrations = await eventModel.listRegistrationsForUser(req.user.id);
    res.render('events/my', { title: 'My event registrations', registrations });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findPublicById(id) : null;
    if (!event) return notFound(res);
    const registered = req.user ? await eventModel.isRegistered(id, req.user.id) : false;
    // The gallery is part of the documentation, so only completed events show photos
    const photos = event.status === 'completed' ? await eventPhotoModel.listForEvent(id) : [];
    const videos = event.status === 'completed' ? await eventVideoModel.listForEvent(id) : [];
    res.render('events/show', { title: event.title, event, registered, photos, videos });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/register', requireLogin, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findPublicById(id) : null;
    if (!event) return notFound(res);

    // First check: a clear message before we even try
    if (await eventModel.isRegistered(id, req.user.id)) {
      req.session.flash = { type: 'error', message: 'You are already registered for this event.' };
      return res.redirect(303, `/events/${id}`);
    }

    const result = await eventModel.register(id, req.user.id);
    const messages = {
      ok: { type: 'success', message: 'You are registered. See you there!' },
      closed: { type: 'error', message: 'Registration is closed for this event.' },
      full: { type: 'error', message: 'Sorry, this event is already full.' },
      duplicate: { type: 'error', message: 'You are already registered for this event.' }
    };
    req.session.flash = messages[result];
    res.redirect(303, `/events/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
