// Officers: announcement drafts and approval.
// Mounted in app.js with requireRole('pro', 'vp_internal', 'president').
// Each action below adds its own, narrower role check:
//   writers (PRO, President): create, edit, delete drafts, submit
//   reviewers (VP Internal, President): approve, return with remarks, unpublish
const express = require('express');
const announcementModel = require('../models/announcementModel');
const announcementPhotoModel = require('../models/announcementPhotoModel');
const announcementVideoModel = require('../models/announcementVideoModel');
const { requireRole } = require('../middleware/auth');
const {
  photoUpload, videoUpload, isRealImage, isRealVideo, removeFiles, removeUploadedPhoto, MAX_FILES
} = require('../middleware/upload');

const router = express.Router();

const CATEGORIES = ['general', 'academic', 'advisory', 'opportunity'];
const STATUSES = ['draft', 'pending', 'published'];
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

// True only for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30)
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Today's date as 'YYYY-MM-DD' in local time
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function validate(body) {
  const old = {
    title: String(body.title ?? '').trim(),
    category: String(body.category ?? '').trim(),
    body: String(body.body ?? '').trim(),
    news_date: String(body.news_date ?? '').trim()
  };
  const errors = [];
  // The date shown on the post (C24): when the news came out, not when it was approved here
  if (!isValidDate(old.news_date)) {
    errors.push('Enter the date of the news.');
  } else if (old.news_date > today()) {
    errors.push('The news date cannot be in the future.');
  }
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
    errors: [], old: { category: 'general', news_date: today() }, remarks: null
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

// ---------- Edit (drafts, and published posts -> back to pending, C14) ----------
const EDITABLE = ['draft', 'published'];
const NOT_EDITABLE = 'Only drafts and published posts can be edited. Pending posts wait for the reviewer.';

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const announcement = id ? await announcementModel.findById(id) : null;
    if (!announcement) return notFound(res);
    if (!EDITABLE.includes(announcement.status)) {
      req.session.flash = { type: 'error', message: NOT_EDITABLE };
      return res.redirect(303, `/manage/announcements/${id}`);
    }
    res.render('manage/announcements/form', {
      title: 'Edit announcement', action: `/manage/announcements/${id}`, categories: CATEGORIES,
      errors: [], old: announcement, remarks: announcement.review_remarks,
      live: announcement.status === 'published'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const existing = id ? await announcementModel.findById(id) : null;
    if (!existing) return notFound(res);
    if (!EDITABLE.includes(existing.status)) return refuseOrNotFound(req, res, id, NOT_EDITABLE);
    const live = existing.status === 'published';

    const { old, errors } = validate(req.body);
    if (errors.length > 0) {
      return res.status(422).render('manage/announcements/form', {
        title: 'Edit announcement', action: `/manage/announcements/${id}`, categories: CATEGORIES,
        errors, old, remarks: existing.review_remarks, live
      });
    }

    // The status is checked again inside the SQL, in case it changed since we read it
    const changed = live
      ? await announcementModel.updatePublished(id, old)
      : await announcementModel.updateDraft(id, old);
    if (changed === 0) return refuseOrNotFound(req, res, id, NOT_EDITABLE);
    req.session.flash = {
      type: 'success',
      message: live
        ? 'Changes saved and sent for approval. The post is hidden until it is approved again.'
        : 'Draft updated.'
    };
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

// The posters page also manages videos. extra: { videoErrors, videoTitle } after a failed video upload.
async function renderPosters(res, status, announcement, errors, extra = {}) {
  const photos = await announcementPhotoModel.listForAnnouncement(announcement.id);
  const videos = await announcementVideoModel.listForAnnouncement(announcement.id);
  res.status(status).render('manage/announcements/photos', {
    title: `Posters and videos: ${announcement.title}`, announcement, photos, videos, errors, maxFiles: MAX_FILES,
    videoErrors: extra.videoErrors || [], videoTitle: extra.videoTitle || ''
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

// ---------- Delete a PUBLISHED post permanently (President only, C23) ----------
// Step 1 shows what will be lost; step 2 (a POST from that page) deletes it.
async function findPublishedPost(req, res) {
  const id = parseId(req.params.id);
  const announcement = id ? await announcementModel.findById(id) : null;
  if (!announcement) {
    notFound(res);
    return null;
  }
  if (announcement.status !== 'published') {
    req.session.flash = { type: 'error', message: 'Only published posts can be deleted this way. Drafts use "Delete draft".' };
    res.redirect(303, `/manage/announcements/${id}`);
    return null;
  }
  return announcement;
}

router.get('/:id/remove', presidentOnly, async (req, res, next) => {
  try {
    const announcement = await findPublishedPost(req, res);
    if (!announcement) return;
    const photos = await announcementPhotoModel.listForAnnouncement(announcement.id);
    const videos = await announcementVideoModel.listForAnnouncement(announcement.id);
    res.render('manage/announcements/remove', {
      title: `Delete: ${announcement.title}`, announcement, photoCount: photos.length, videoCount: videos.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/remove', presidentOnly, async (req, res, next) => {
  try {
    const announcement = await findPublishedPost(req, res);
    if (!announcement) return;
    // Note the uploaded files first: their rows are deleted with the post
    const media = [
      ...await announcementPhotoModel.listForAnnouncement(announcement.id),
      ...await announcementVideoModel.listForAnnouncement(announcement.id)
    ];
    const deleted = await announcementModel.deletePublished(announcement.id);
    if (deleted === 0) return refuseOrNotFound(req, res, announcement.id, 'Only published posts can be deleted this way.');
    media.forEach((m) => removeUploadedPhoto(m.file_path));
    req.session.flash = { type: 'success', message: `"${announcement.title}" was deleted permanently.` };
    res.redirect(303, '/manage/announcements');
  } catch (err) {
    next(err);
  }
});

// ---------- Videos (PRO and President, C21) ----------
// Same rules as posters: drafts change freely; a published post goes back to Pending.
const uploadNewsVideo = videoUpload('news');

// writersOnly runs BEFORE the upload, so no file is saved for the wrong role
router.post('/:id/videos', writersOnly, uploadNewsVideo, async (req, res, next) => {
  const file = req.file || null;
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return removeFiles(file ? [file] : []);

    const title = String(req.body.title ?? '').trim();
    const errors = [];
    if (req.uploadError) errors.push(req.uploadError);
    if (req.skippedFiles) errors.push('Only MP4, WebM or MOV videos can be uploaded.');
    if (file && !isRealVideo(file.path)) errors.push('That file is not a real MP4, WebM or MOV video.');
    if (!file && errors.length === 0) errors.push('Choose a video to upload.');
    if (title === '' || title.length > 150) errors.push('Give the video a title (up to 150 characters).');
    if (errors.length > 0) {
      removeFiles(file ? [file] : []); // all or nothing
      return renderPosters(res, 422, announcement, [], { videoErrors: errors, videoTitle: title });
    }

    await announcementVideoModel.add(announcement.id, `/uploads/news/${file.filename}`, title);
    req.session.flash = { type: 'success', message: await afterPosterChange(announcement, 'Video added.') };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    removeFiles(file ? [file] : []);
    next(err);
  }
});

router.post('/:id/videos/:videoId/delete', writersOnly, async (req, res, next) => {
  try {
    const announcement = await findPosterPost(req, res);
    if (!announcement) return;
    const videoId = parseId(req.params.videoId);
    const filePath = videoId ? await announcementVideoModel.remove(announcement.id, videoId) : null;
    if (!filePath) return notFound(res);
    removeUploadedPhoto(filePath);
    req.session.flash = { type: 'success', message: await afterPosterChange(announcement, 'Video removed.') };
    res.redirect(303, posterRedirect(announcement));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
