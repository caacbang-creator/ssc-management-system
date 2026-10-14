// Officers: event drafts, approval, completion, documentation and registrants.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
// Each action adds its own, narrower role check:
//   writers (PRO, President): create, edit, delete drafts, submit, complete, documentation
//   reviewers (VP Internal, President): approve, return with remarks, cancel
const express = require('express');
const eventModel = require('../models/eventModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const STATUSES = ['draft', 'pending', 'published', 'completed', 'cancelled'];
const writersOnly = requireRole('pro', 'president');
const reviewersOnly = requireRole('vp_internal', 'president');

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// Today's date as 'YYYY-MM-DD' in local time
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// True only for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30)
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// True for 'HH:MM' from 00:00 to 23:59
function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validate(body) {
  const old = {
    title: String(body.title ?? '').trim(),
    description: String(body.description ?? '').trim(),
    venue: String(body.venue ?? '').trim(),
    event_date: String(body.event_date ?? '').trim(),
    start_time: String(body.start_time ?? '').trim(),
    end_time: String(body.end_time ?? '').trim(),
    capacity: String(body.capacity ?? '').trim()
  };
  const errors = [];
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  if (old.description === '' || old.description.length > 5000) {
    errors.push('Description is required (up to 5,000 characters).');
  }
  if (old.venue === '' || old.venue.length > 150) {
    errors.push('Venue is required (up to 150 characters).');
  }
  if (!isValidDate(old.event_date)) {
    errors.push('Enter a valid event date.');
  } else if (old.event_date < today()) {
    errors.push('The event date cannot be in the past.');
  }
  if (!isValidTime(old.start_time)) {
    errors.push('Enter a valid start time.');
  }
  if (old.end_time !== '') {
    if (!isValidTime(old.end_time)) {
      errors.push('Enter a valid end time, or leave it empty.');
    } else if (isValidTime(old.start_time) && old.end_time <= old.start_time) {
      errors.push('End time must be later than the start time.');
    }
  }
  if (!/^\d{1,4}$/.test(old.capacity) || Number(old.capacity) < 1) {
    errors.push('Capacity must be a whole number from 1 to 9999.');
  }
  return { old, errors };
}

function toRecord(old) {
  return {
    title: old.title,
    description: old.description,
    venue: old.venue,
    eventDate: old.event_date,
    startTime: old.start_time,
    endTime: old.end_time || null,
    capacity: Number(old.capacity)
  };
}

// The database returns '08:00:00'; the form uses '08:00'
function toFormValues(event) {
  return {
    ...event,
    start_time: event.start_time ? event.start_time.slice(0, 5) : '',
    end_time: event.end_time ? event.end_time.slice(0, 5) : '',
    capacity: String(event.capacity)
  };
}

// A status change matched 0 rows: 404 if the event does not exist,
// otherwise refuse with a message.
async function refuseOrNotFound(req, res, id, message) {
  const existing = await eventModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `/manage/events/${id}`);
}

function renderForm(res, status, title, action, errors, old, remarks) {
  res.status(status).render('manage/events/form', { title, action, errors, old, remarks, minDate: today() });
}

// ---------- List ----------
router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const events = await eventModel.listForManage(status);
    res.render('manage/events/index', { title: 'Manage events', events, status });
  } catch (err) {
    next(err);
  }
});

// ---------- Create ----------
router.get('/new', writersOnly, (req, res) => {
  renderForm(res, 200, 'New event', '/manage/events', [], {}, null);
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = validate(req.body);
    if (errors.length > 0) {
      return renderForm(res, 422, 'New event', '/manage/events', errors, old, null);
    }
    const id = await eventModel.create(toRecord(old), req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Submit it for approval when it is ready.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- View one ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findById(id) : null;
    if (!event) return notFound(res);
    res.render('manage/events/show', { title: event.title, event, errors: [], oldRemarks: '', today: today() });
  } catch (err) {
    next(err);
  }
});

// ---------- Edit (drafts only) ----------
router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findById(id) : null;
    if (!event) return notFound(res);
    if (event.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `/manage/events/${id}`);
    }
    renderForm(res, 200, 'Edit event', `/manage/events/${id}`, [], toFormValues(event), event.review_remarks);
  } catch (err) {
    next(err);
  }
});

router.post('/:id', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { old, errors } = validate(req.body);
    if (errors.length > 0) {
      const existing = await eventModel.findById(id);
      if (!existing) return notFound(res);
      return renderForm(res, 422, 'Edit event', `/manage/events/${id}`, errors, old, existing.review_remarks);
    }
    const changed = await eventModel.updateDraft(id, toRecord(old));
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be edited.');
    req.session.flash = { type: 'success', message: 'Draft updated.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Delete (drafts only) ----------
router.post('/:id/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await eventModel.deleteDraft(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published events are cancelled instead.');
    req.session.flash = { type: 'success', message: 'Draft deleted.' };
    res.redirect(303, '/manage/events');
  } catch (err) {
    next(err);
  }
});

// ---------- Submit: draft -> pending ----------
router.post('/:id/submit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await eventModel.submit(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be submitted for approval.');
    req.session.flash = { type: 'success', message: 'Submitted for approval.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Approve: pending -> published ----------
router.post('/:id/approve', reviewersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await eventModel.approve(id, req.user.id);
    if (changed === 0) {
      return refuseOrNotFound(req, res, id,
        'Only pending events with a date of today or later can be approved. Return past-dated events to draft.');
    }
    req.session.flash = { type: 'success', message: 'Event approved and published. Students can now register.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Return: pending -> draft, remarks required ----------
router.post('/:id/return', reviewersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const remarks = String(req.body.remarks ?? '').trim();
    if (remarks === '' || remarks.length > 500) {
      const event = await eventModel.findById(id);
      if (!event) return notFound(res);
      return res.status(422).render('manage/events/show', {
        title: event.title, event, today: today(), oldRemarks: remarks,
        errors: ['Remarks are required when returning a draft (up to 500 characters).']
      });
    }
    const changed = await eventModel.returnToDraft(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending events can be returned.');
    req.session.flash = { type: 'success', message: 'Returned to draft with your remarks.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Cancel: published -> cancelled ----------
router.post('/:id/cancel', reviewersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await eventModel.cancel(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only published events can be cancelled.');
    req.session.flash = { type: 'success', message: 'Event cancelled. It stays visible to students as cancelled.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Complete: published -> completed ----------
router.post('/:id/complete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await eventModel.complete(id);
    if (changed === 0) {
      return refuseOrNotFound(req, res, id, 'Only published events can be completed, on or after the event date.');
    }
    req.session.flash = { type: 'success', message: 'Event marked as completed. You can now add documentation.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Documentation (completed events only) ----------
router.get('/:id/documentation', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findById(id) : null;
    if (!event) return notFound(res);
    if (event.status !== 'completed') {
      req.session.flash = { type: 'error', message: 'Documentation can only be added to completed events.' };
      return res.redirect(303, `/manage/events/${id}`);
    }
    res.render('manage/events/documentation', {
      title: 'Event documentation', event, errors: [], old: { documentation: event.documentation || '' }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/documentation', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const old = { documentation: String(req.body.documentation ?? '').trim() };
    if (old.documentation === '' || old.documentation.length > 5000) {
      const event = await eventModel.findById(id);
      if (!event) return notFound(res);
      return res.status(422).render('manage/events/documentation', {
        title: 'Event documentation', event, old,
        errors: ['Documentation is required (up to 5,000 characters).']
      });
    }
    const changed = await eventModel.saveDocumentation(id, old.documentation);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Documentation can only be added to completed events.');
    req.session.flash = { type: 'success', message: 'Documentation saved. It is shown on the public event page.' };
    res.redirect(303, `/manage/events/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Registrants (all three roles) ----------
router.get('/:id/registrants', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findById(id) : null;
    if (!event) return notFound(res);
    const registrants = await eventModel.listRegistrants(id);
    res.render('manage/events/registrants', { title: 'Registrants', event, registrants });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
