// Officers: announcement drafts and approval.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
// Each action below adds its own, narrower role check:
//   writers (PRO, President): create, edit, delete drafts, submit
//   reviewers (VP Internal, President): approve, return with remarks, unpublish
const express = require('express');
const announcementModel = require('../models/announcementModel');
const announcementPhotoModel = require('../models/announcementPhotoModel');
const { requireRole } = require('../middleware/auth');
const { photoUpload, isRealImage, removeFiles, removeUploadedPhoto, MAX_FILES } = require('../middleware/upload');

const router = express.Router();

const CATEGORIES = ['general', 'academic', 'advisory', 'opportunity'];
const STATUSES = ['draft', 'pending', 'published'];
const writersOnly = requireRole('pro', 'president');
const reviewersOnly = requireRole('vp_internal', 'president');

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

function validate(body) {
  const old = {
    title: String(body.title ?? '').trim(),
    category: String(body.category ?? '').trim(),
    body: String(body.body ?? '').trim()
  };
  const errors = [];
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  if (!CATEGORIES.includes(old.category)) {
    errors.push('Choose a category from the list.');
  }
  if (old.body === '' || old.body.length > 10000) {
    errors.push('Announcement text is required (up to 10,000 characters).');
  }
  return { old, errors };
}

// A status change matched 0 rows: either the announcement does not exist (404),
// or it is not in the right status for this action (refused, with a message).
async function refuseOrNotFound(req, res, id, message) {
  const existing = await announcementModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `/manage/announcements/${id}`);
}

// ---------- List ----------
router.get('/', async (req, res, next) => {
  try {
    // The filter is checked against an allow-list before it reaches the model
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const announcements = await announcementModel.listForManage(status);
    res.render('manage/announcements/index', {
      title: 'Manage announcements', announcements, status
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Create ----------
router.get('/new', writersOnly, (req, res) => {
  res.render('manage/announcements/form', {
    title: 'New announcement', action: '/manage/announcements', categories: CATEGORIES,
    errors: [], old: { category: 'general' }, remarks: null
  });
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = validate(req.body);
    if (errors.length > 0) {
      return res.status(422).render('manage/announcements/form', {
        title: 'New announcement', action: '/manage/announcements', categories: CATEGORIES,
        errors, old, remarks: null
      });
    }
    const id = await announcementModel.create(old, req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Submit it for approval when it is ready.' };
    res.redirect(303, `/manage/announcements/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- View one (any status) ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const announcement = id ? await announcementModel.findById(id) : null;
    if (!announcement) return notFound(res);
    res.render('manage/announcements/show', {
      title: announcement.title, announcement, errors: [], oldRemarks: ''
    });
  } catch (err) {
    next(err);
  }
});

// ---------- Edit (drafts only) ----------
router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const announcement = id ? await announcementModel.findById(id) : null;
    if (!announcement) return notFound(res);
    if (announcement.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `/manage/announcements/${id}`);
    }
    res.render('manage/announcements/form', {
      title: 'Edit announcement', action: `/manage/announcements/${id}`, categories: CATEGORIES,
      errors: [], old: announcement, remarks: announcement.review_remarks
    });
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
      const existing = await announcementModel.findById(id);
      if (!existing) return notFound(res);
      return res.status(422).render('manage/announcements/form', {
        title: 'Edit announcement', action: `/manage/announcements/${id}`, categories: CATEGORIES,
        errors, old, remarks: existing.review_remarks
      });
    }
    const changed = await announcementModel.updateDraft(id, old);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be edited.');
    req.session.flash = { type: 'success', message: 'Draft updated.' };
    res.redirect(303, `/manage/announcements/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Delete (drafts only) ----------
router.post('/:id/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await announcementModel.deleteDraft(id);
    if (changed === 0) {
      return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published announcements are unpublished instead.');
    }
    req.session.flash = { type: 'success', message: 'Draft deleted.' };
    res.redirect(303, '/manage/announcements');
  } catch (err) {
    next(err);
  }
});

// ---------- Submit: draft -> pending ----------
router.post('/:id/submit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await announcementModel.submit(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be submitted for approval.');
    req.session.flash = { type: 'success', message: 'Submitted for approval.' };
    res.redirect(303, `/manage/announcements/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Approve: pending -> published ----------
router.post('/:id/approve', reviewersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await announcementModel.approve(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending announcements can be approved.');
    req.session.flash = { type: 'success', message: 'Announcement approved and published.' };
    res.redirect(303, `/manage/announcements/${id}`);
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
      const announcement = await announcementModel.findById(id);
      if (!announcement) return notFound(res);
      return res.status(422).render('manage/announcements/show', {
        title: announcement.title,
        announcement,
        errors: ['Remarks are required when returning a draft (up to 500 characters).'],
        oldRemarks: remarks
      });
    }
    const changed = await announcementModel.returnToDraft(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending announcements can be returned.');
    req.session.flash = { type: 'success', message: 'Returned to draft with your remarks.' };
    res.redirect(303, `/manage/announcements/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Unpublish: published -> draft ----------
router.post('/:id/unpublish', reviewersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await announcementModel.unpublish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only published announcements can be unpublished.');
    req.session.flash = { type: 'success', message: 'Announcement unpublished. It is a draft again.' };
    res.redirect(303, `/manage/announcements/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Posters (PRO and President) ----------
// Drafts: change freely. Published: any change sends the post back to Pending (C14),
// so a VP Internal or the President approves the new version. Pending: locked.
const uploadPosters = photoUpload('news');

// Finds the announcement for a poster page. Sends the 404 / refusal itself and returns null.
async function findPosterPost(req, res) {
  const id = parseId(req.params.id);
  const announcement = id ? await announcementModel.findById(id) : null;
  if (!announcement) {
    notFound(res);
    return null;
  }
  if (!['draft', 'published'].includes(announcement.status)) {
    req.session.flash = { type: 'error', message: 'Posters cannot be changed while the post is waiting for approval.' };
    res.redirect(303, `/manage/announcements/${id}`);
    return null;
  }
  return announcement;
}

async function renderPosters(res, status, announcement, errors) {
  const photos = await announcementPhotoModel.listForAnnouncement(announcement.id);
  res.status(status).render('manage/announcements/photos', {
    title: `Posters: ${announcement.title}`, announcement, photos, errors, maxFiles: MAX_FILES
  });
}

// After a successful change: a published post goes back to Pending. Returns the flash text.
async function afterPosterChange(announcement, message) {
  if (announcement.status !== 'published') return message;
  await announcementModel.sendBackForApproval(announcement.id);
  return `${message} The post was sent back for approval and is hidden until it is approved.`;
}

// A published post is Pending after a change, and the poster page is locked while pending,
// so go to the post's page (it shows the new status); drafts stay on the poster page.
function posterRedirect(announcement) {
  return announcement.status === 'published'
    ? `/manage/announcements/${announcement.id}`
    : `/manage/announcements/${announcement.id}/photos`;
}

router.get('/:id/photos', writersOnly, async (req, res, next) => {
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return;
    await renderPosters(res, 200, announcement, []);
  } catch (err) {
    next(err);
  }
});

// writersOnly runs BEFORE uploadPosters, so no file is saved for the wrong role
router.post('/:id/photos', writersOnly, uploadPosters, async (req, res, next) => {
  const files = req.files || [];
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return removeFiles(files);

    const real = files.filter((file) => isRealImage(file.path));
    const skipped = (req.skippedFiles || 0) + (files.length - real.length);
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);
    if (skipped > 0) errors.push(`Only JPG, PNG or WebP images can be uploaded (${skipped} file(s) refused).`);
    if (files.length === 0 && errors.length === 0) errors.push('Choose at least one poster to upload.');
    if (errors.length > 0) {
      removeFiles(files); // all or nothing: fix the selection and upload again
      return renderPosters(res, 422, announcement, errors);
    }

    await announcementPhotoModel.addMany(announcement.id, real.map((file) => `/uploads/news/${file.filename}`));
    const message = await afterPosterChange(announcement, `${real.length} poster(s) added.`);
    req.session.flash = { type: 'success', message };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    removeFiles(files);
    next(err);
  }
});

router.post('/:id/photos/:photoId/caption', writersOnly, async (req, res, next) => {
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return;
    const photoId = parseId(req.params.photoId);
    const caption = String(req.body.caption ?? '').trim();
    if (caption.length > 150) {
      return renderPosters(res, 422, announcement, ['A caption can be up to 150 characters.']);
    }
    const changed = photoId
      ? await announcementPhotoModel.updateCaption(announcement.id, photoId, caption || null)
      : 0;
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: await afterPosterChange(announcement, 'Caption saved.') };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/photos/:photoId/move', writersOnly, async (req, res, next) => {
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return;
    const photoId = parseId(req.params.photoId);
    const direction = req.body.direction;
    if (!photoId || !['up', 'down'].includes(direction)) return notFound(res);
    const result = await announcementPhotoModel.move(announcement.id, photoId, direction);
    if (result === 'not_found') return notFound(res);
    if (result === 'edge') {
      // Nothing changed, so the post keeps its status
      req.session.flash = { type: 'error', message: 'That poster cannot move any further.' };
      return res.redirect(303, `/manage/announcements/${announcement.id}/photos`);
    }
    req.session.flash = { type: 'success', message: await afterPosterChange(announcement, 'Order changed.') };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/photos/:photoId/delete', writersOnly, async (req, res, next) => {
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return;
    const photoId = parseId(req.params.photoId);
    const filePath = photoId ? await announcementPhotoModel.remove(announcement.id, photoId) : null;
    if (!filePath) return notFound(res);
    removeUploadedPhoto(filePath);
    req.session.flash = { type: 'success', message: await afterPosterChange(announcement, 'Poster removed.') };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
