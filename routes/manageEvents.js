// Officers: event drafts, approval, completion, documentation and registrants.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
// Each action adds its own, narrower role check:
//   writers (PRO, President): create, edit, delete drafts, submit, complete, documentation
//   reviewers (VP Internal, President): approve, return with remarks, cancel
const express = require('express');
const eventModel = require('../models/eventModel');
const eventPhotoModel = require('../models/eventPhotoModel');
const eventVideoModel = require('../models/eventVideoModel');
const { requireRole } = require('../middleware/auth');
const {
  photoUpload, videoUpload, isRealImage, isRealVideo, removeFiles, removeUploadedPhoto, MAX_FILES
} = require('../middleware/upload');

const router = express.Router();

const STATUSES = ['draft', 'pending', 'published', 'completed', 'cancelled'];
const writersOnly = requireRole('pro', 'president');
const reviewersOnly = requireRole('vp_internal', 'president');
const presidentOnly = requireRole('president');

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
  // Venue and capacity are optional (C22): no venue = "to be announced", no capacity = no limit
  if (old.venue.length > 150) {
    errors.push('Venue must be 150 characters or fewer.');
  }
  // Past dates are allowed (C20): the PRO can post an event that already happened, to document it.
  // It still needs approval, and students cannot register (registration needs a date of today or later).
  if (!isValidDate(old.event_date)) {
    errors.push('Enter a valid event date.');
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
  if (old.capacity !== '' && (!/^\d{1,4}$/.test(old.capacity) || Number(old.capacity) < 1)) {
    errors.push('Capacity must be a whole number from 1 to 9999, or leave it empty for no limit.');
  }
  return { old, errors };
}

function toRecord(old) {
  return {
    title: old.title,
    description: old.description,
    venue: old.venue || null,
    eventDate: old.event_date,
    startTime: old.start_time,
    endTime: old.end_time || null,
    capacity: old.capacity === '' ? null : Number(old.capacity)
  };
}

// The database returns '08:00:00'; the form uses '08:00'
function toFormValues(event) {
  return {
    ...event,
    start_time: event.start_time ? event.start_time.slice(0, 5) : '',
    end_time: event.end_time ? event.end_time.slice(0, 5) : '',
    venue: event.venue || '',
    capacity: event.capacity === null ? '' : String(event.capacity)
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

// live = editing a published event (the form warns that saving sends it back for approval)
function renderForm(res, status, title, action, errors, old, remarks, live = false) {
  res.status(status).render('manage/events/form', { title, action, errors, old, remarks, live });
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

// ---------- Edit (drafts, and published events -> back to pending, C14) ----------
const EDITABLE = ['draft', 'published'];
const NOT_EDITABLE = 'Only drafts and published events can be edited. Pending events wait for the reviewer.';

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const event = id ? await eventModel.findById(id) : null;
    if (!event) return notFound(res);
    if (!EDITABLE.includes(event.status)) {
      req.session.flash = { type: 'error', message: NOT_EDITABLE };
      return res.redirect(303, `/manage/events/${id}`);
    }
    renderForm(res, 200, 'Edit event', `/manage/events/${id}`, [], toFormValues(event), event.review_remarks,
      event.status === 'published');
  } catch (err) {
    next(err);
  }
});

router.post('/:id', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const existing = id ? await eventModel.findById(id) : null;
    if (!existing) return notFound(res);
    if (!EDITABLE.includes(existing.status)) return refuseOrNotFound(req, res, id, NOT_EDITABLE);
    const live = existing.status === 'published';

    const { old, errors } = validate(req.body);
    // Students may already be registered: the new capacity must still fit them
    if (errors.length === 0 && old.capacity !== '' && Number(old.capacity) < existing.registered_count) {
      errors.push(`Capacity cannot be lower than the ${existing.registered_count} students already registered.`);
    }
    if (errors.length > 0) {
      return renderForm(res, 422, 'Edit event', `/manage/events/${id}`, errors, old, existing.review_remarks, live);
    }

    // The status is checked again inside the SQL, in case it changed since we read it
    const changed = live
      ? await eventModel.updatePublished(id, toRecord(old))
      : await eventModel.updateDraft(id, toRecord(old));
    if (changed === 0) return refuseOrNotFound(req, res, id, NOT_EDITABLE);
    req.session.flash = {
      type: 'success',
      message: live
        ? 'Changes saved and sent for approval. The event is hidden until it is approved again.'
        : 'Draft updated.'
    };
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
    // A draft may already have photos and videos: note their files before the rows are deleted
    const media = [...await eventPhotoModel.listForEvent(id), ...await eventVideoModel.listForEvent(id)];
    const changed = await eventModel.deleteDraft(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published events are cancelled instead.');
    // The rows went with the event (ON DELETE CASCADE); delete the uploaded files too
    media.forEach((m) => removeUploadedPhoto(m.file_path));
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
    const existing = await eventModel.findById(id);
    const changed = await eventModel.approve(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending events can be approved.');
    // A past event is published for the record only (C20): registration stays closed
    const isPast = existing.event_date < today();
    req.session.flash = {
      type: 'success',
      message: isPast
        ? 'Event approved and published. It already happened, so registration is closed. The PRO can now mark it completed.'
        : 'Event approved and published. Students can now register.'
    };
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

// ---------- Photos (completed events only, PRO and President) ----------
// Photos and videos can be prepared on a DRAFT (before it is sent for approval) and added to a
// COMPLETED event (documentation, no new approval needed). Pending and published events are
// locked so nothing changes while the reviewer looks at it or while it is live.
// The public page shows them only once the event is completed.
const MEDIA_STATUSES = ['draft', 'completed'];
const uploadEventPhotos = photoUpload('events');

// Finds the event for a photo page. Sends the 404 / refusal itself and returns null.
async function findPhotoEvent(req, res) {
  const id = parseId(req.params.id);
  const event = id ? await eventModel.findById(id) : null;
  if (!event) {
    notFound(res);
    return null;
  }
  if (!MEDIA_STATUSES.includes(event.status)) {
    req.session.flash = {
      type: 'error',
      message: 'Photos and videos can be added to a draft, or after the event is marked completed.'
    };
    res.redirect(303, `/manage/events/${id}`);
    return null;
  }
  return event;
}

// The photos page also manages videos. extra: { videoErrors, videoTitle } after a failed video upload.
async function renderPhotos(res, status, event, errors, extra = {}) {
  const photos = await eventPhotoModel.listForEvent(event.id);
  const videos = await eventVideoModel.listForEvent(event.id);
  res.status(status).render('manage/events/photos', {
    title: `Photos and videos: ${event.title}`, event, photos, videos, errors, maxFiles: MAX_FILES,
    videoErrors: extra.videoErrors || [], videoTitle: extra.videoTitle || ''
  });
}

router.get('/:id/photos', writersOnly, async (req, res, next) => {
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return;
    await renderPhotos(res, 200, event, []);
  } catch (err) {
    next(err);
  }
});

// writersOnly runs BEFORE uploadEventPhotos, so no file is saved for the wrong role
router.post('/:id/photos', writersOnly, uploadEventPhotos, async (req, res, next) => {
  const files = req.files || [];
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return removeFiles(files);

    const real = files.filter((file) => isRealImage(file.path));
    const skipped = (req.skippedFiles || 0) + (files.length - real.length);
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);
    if (skipped > 0) errors.push(`Only JPG, PNG or WebP images can be uploaded (${skipped} file(s) refused).`);
    if (files.length === 0 && errors.length === 0) errors.push('Choose at least one photo to upload.');
    if (errors.length > 0) {
      removeFiles(files); // all or nothing: fix the selection and upload again
      return renderPhotos(res, 422, event, errors);
    }

    await eventPhotoModel.addMany(event.id, real.map((file) => `/uploads/events/${file.filename}`));
    req.session.flash = { type: 'success', message: `${real.length} photo(s) added.` };
    res.redirect(303, `/manage/events/${event.id}/photos`);
  } catch (err) {
    removeFiles(files);
    next(err);
  }
});

router.post('/:id/photos/:photoId/caption', writersOnly, async (req, res, next) => {
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return;
    const photoId = parseId(req.params.photoId);
    const caption = String(req.body.caption ?? '').trim();
    if (caption.length > 150) {
      return renderPhotos(res, 422, event, ['A caption can be up to 150 characters.']);
    }
    const changed = photoId ? await eventPhotoModel.updateCaption(event.id, photoId, caption || null) : 0;
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Caption saved.' };
    res.redirect(303, `/manage/events/${event.id}/photos`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/photos/:photoId/move', writersOnly, async (req, res, next) => {
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return;
    const photoId = parseId(req.params.photoId);
    const direction = req.body.direction;
    if (!photoId || !['up', 'down'].includes(direction)) return notFound(res);
    const result = await eventPhotoModel.move(event.id, photoId, direction);
    if (result === 'not_found') return notFound(res);
    if (result === 'edge') {
      req.session.flash = { type: 'error', message: 'That photo cannot move any further.' };
    }
    res.redirect(303, `/manage/events/${event.id}/photos`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/photos/:photoId/delete', writersOnly, async (req, res, next) => {
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return;
    const photoId = parseId(req.params.photoId);
    const filePath = photoId ? await eventPhotoModel.remove(event.id, photoId) : null;
    if (!filePath) return notFound(res);
    removeUploadedPhoto(filePath);
    req.session.flash = { type: 'success', message: 'Photo removed.' };
    res.redirect(303, `/manage/events/${event.id}/photos`);
  } catch (err) {
    next(err);
  }
});

// ---------- Delete a public event permanently (President only, C23) ----------
// Published, completed or cancelled. Step 1 shows what will be lost; step 2 deletes it.
const PUBLIC_STATUSES = ['published', 'completed', 'cancelled'];

async function findPublicEvent(req, res) {
  const id = parseId(req.params.id);
  const event = id ? await eventModel.findById(id) : null;
  if (!event) {
    notFound(res);
    return null;
  }
  if (!PUBLIC_STATUSES.includes(event.status)) {
    req.session.flash = { type: 'error', message: 'Only published, completed or cancelled events can be deleted this way.' };
    res.redirect(303, `/manage/events/${id}`);
    return null;
  }
  return event;
}

router.get('/:id/remove', presidentOnly, async (req, res, next) => {
  try {
    const event = await findPublicEvent(req, res);
    if (!event) return;
    const photos = await eventPhotoModel.listForEvent(event.id);
    const videos = await eventVideoModel.listForEvent(event.id);
    res.render('manage/events/remove', {
      title: `Delete: ${event.title}`, event, photoCount: photos.length, videoCount: videos.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/remove', presidentOnly, async (req, res, next) => {
  try {
    const event = await findPublicEvent(req, res);
    if (!event) return;
    // Note the uploaded files first: their rows are deleted with the event
    const media = [...await eventPhotoModel.listForEvent(event.id), ...await eventVideoModel.listForEvent(event.id)];
    const deleted = await eventModel.deletePublic(event.id);
    if (deleted === 0) return refuseOrNotFound(req, res, event.id, 'Only published, completed or cancelled events can be deleted this way.');
    media.forEach((m) => removeUploadedPhoto(m.file_path));
    req.session.flash = { type: 'success', message: `"${event.title}" was deleted permanently.` };
    res.redirect(303, '/manage/events');
  } catch (err) {
    next(err);
  }
});

// ---------- Videos (completed events only, PRO and President, C21) ----------
const uploadEventVideo = videoUpload('events');

// writersOnly runs BEFORE the upload, so no file is saved for the wrong role
router.post('/:id/videos', writersOnly, uploadEventVideo, async (req, res, next) => {
  const file = req.file || null;
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return removeFiles(file ? [file] : []);

    const title = String(req.body.title ?? '').trim();
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);
    if (req.skippedFiles) errors.push('Only MP4, WebM or MOV videos can be uploaded.');
    if (file && !isRealVideo(file.path)) errors.push('That file is not a real MP4, WebM or MOV video.');
    if (!file && errors.length === 0) errors.push('Choose a video to upload.');
    if (title === '' || title.length > 150) errors.push('Give the video a title (up to 150 characters).');
    if (errors.length > 0) {
      removeFiles(file ? [file] : []); // all or nothing
      return renderPhotos(res, 422, event, [], { videoErrors: errors, videoTitle: title });
    }

    await eventVideoModel.add(event.id, `/uploads/events/${file.filename}`, title);
    req.session.flash = { type: 'success', message: 'Video added.' };
    res.redirect(303, `/manage/events/${event.id}/photos#videos`);
  } catch (err) {
    removeFiles(file ? [file] : []);
    next(err);
  }
});

router.post('/:id/videos/:videoId/delete', writersOnly, async (req, res, next) => {
  try {
    const event = await findPhotoEvent(req, res);
    if (!event) return;
    const videoId = parseId(req.params.videoId);
    const filePath = videoId ? await eventVideoModel.remove(event.id, videoId) : null;
    if (!filePath) return notFound(res);
    removeUploadedPhoto(filePath);
    req.session.flash = { type: 'success', message: 'Video removed.' };
    res.redirect(303, `/manage/events/${event.id}/photos#videos`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
