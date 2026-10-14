// Resolutions: the Secretary submits, ONLY the President publishes (decision C2-B).
// Mounted in app.js with requireRole('secretary', 'vp_internal', 'president').
//   writers (Secretary, President): create, edit, delete drafts, submit
//   publisher (President): publish, return with remarks, unpublish
//   VP Internal: read-only
const express = require('express');
const resolutionModel = require('../models/resolutionModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const BASE = '/manage/resolutions';
const STATUSES = ['draft', 'pending', 'published'];
const writersOnly = requireRole('secretary', 'president');
const publisherOnly = requireRole('president');

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

async function validate(body, excludeId) {
  const old = {
    resolution_no: String(body.resolution_no ?? '').trim().toUpperCase(),
    title: String(body.title ?? '').trim(),
    body: String(body.body ?? '').trim(),
    date_adopted: String(body.date_adopted ?? '').trim()
  };
  const errors = [];
  if (!/^[A-Z0-9-]{1,30}$/.test(old.resolution_no)) {
    errors.push('Resolution number is required (letters, numbers and hyphens, up to 30), e.g. SSC-RES-2026-002.');
  } else if (await resolutionModel.numberExists(old.resolution_no, excludeId)) {
    errors.push('That resolution number is already used.');
  }
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  if (old.body === '' || old.body.length > 10000) {
    errors.push('Resolution text is required (up to 10,000 characters).');
  }
  if (!isValidDate(old.date_adopted)) {
    errors.push('Enter a valid adoption date.');
  } else if (old.date_adopted > today()) {
    errors.push('The adoption date cannot be in the future.');
  }
  return { old, errors };
}

function toRecord(old) {
  return { resolutionNo: old.resolution_no, title: old.title, body: old.body, dateAdopted: old.date_adopted };
}

async function refuseOrNotFound(req, res, id, message) {
  const existing = await resolutionModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `${BASE}/${id}`);
}

function renderForm(res, status, title, action, errors, old, remarks) {
  res.status(status).render('manage/resolutions/form', { title, action, errors, old, remarks, maxDate: today() });
}

const DUPLICATE_MESSAGE = 'That resolution number is already used.';

router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const resolutions = await resolutionModel.listForManage(status);
    res.render('manage/resolutions/index', { title: 'Manage resolutions', resolutions, status });
  } catch (err) {
    next(err);
  }
});

router.get('/new', writersOnly, (req, res) => {
  renderForm(res, 200, 'New resolution', BASE, [], {}, null);
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = await validate(req.body, null);
    if (errors.length > 0) return renderForm(res, 422, 'New resolution', BASE, errors, old, null);
    const id = await resolutionModel.create(toRecord(old), req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Submit it to the President when it is ready.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    // UNIQUE(resolution_no) is the final check
    if (err.code === 'ER_DUP_ENTRY') return renderForm(res, 422, 'New resolution', BASE, [DUPLICATE_MESSAGE], req.body, null);
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const resolution = id ? await resolutionModel.findById(id) : null;
    if (!resolution) return notFound(res);
    res.render('manage/resolutions/show', { title: resolution.title, resolution, errors: [], oldRemarks: '' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const resolution = id ? await resolutionModel.findById(id) : null;
    if (!resolution) return notFound(res);
    if (resolution.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `${BASE}/${id}`);
    }
    renderForm(res, 200, 'Edit resolution', `${BASE}/${id}`, [], resolution, resolution.review_remarks);
  } catch (err) {
    next(err);
  }
});

router.post('/:id', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { old, errors } = await validate(req.body, id);
    if (errors.length > 0) {
      const existing = await resolutionModel.findById(id);
      if (!existing) return notFound(res);
      return renderForm(res, 422, 'Edit resolution', `${BASE}/${id}`, errors, old, existing.review_remarks);
    }
    const changed = await resolutionModel.updateDraft(id, toRecord(old));
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be edited.');
    req.session.flash = { type: 'success', message: 'Draft updated.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 422, 'Edit resolution', `${BASE}/${req.params.id}`, [DUPLICATE_MESSAGE], req.body, null);
    }
    next(err);
  }
});

router.post('/:id/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await resolutionModel.deleteDraft(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published resolutions are unpublished instead.');
    req.session.flash = { type: 'success', message: 'Draft deleted.' };
    res.redirect(303, BASE);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/submit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await resolutionModel.submit(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be submitted.');
    req.session.flash = { type: 'success', message: 'Submitted to the President for publishing.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/publish', publisherOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await resolutionModel.publish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending resolutions can be published.');
    req.session.flash = { type: 'success', message: 'Resolution published on the SSC Documents page.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/return', publisherOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const remarks = String(req.body.remarks ?? '').trim();
    if (remarks === '' || remarks.length > 500) {
      const resolution = await resolutionModel.findById(id);
      if (!resolution) return notFound(res);
      return res.status(422).render('manage/resolutions/show', {
        title: resolution.title, resolution, oldRemarks: remarks,
        errors: ['Remarks are required when returning a draft (up to 500 characters).']
      });
    }
    const changed = await resolutionModel.returnToDraft(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending resolutions can be returned.');
    req.session.flash = { type: 'success', message: 'Returned to draft with your remarks.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unpublish', publisherOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await resolutionModel.unpublish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only published resolutions can be unpublished.');
    req.session.flash = { type: 'success', message: 'Resolution unpublished. It is a draft again.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
