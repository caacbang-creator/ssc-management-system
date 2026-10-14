// Other SSC documents: the Secretary submits, ONLY the President publishes (decision C2-B).
// Mounted in app.js with requireRole('secretary', 'president').
//   writers (Secretary, President): create, edit, delete drafts, submit
//   publisher (President): publish, return with remarks, unpublish
const express = require('express');
const documentModel = require('../models/documentModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const BASE = '/manage/documents';
const STATUSES = ['draft', 'pending', 'published'];
const DOC_TYPES = ['minutes', 'memorandum', 'letter', 'other'];
const writersOnly = requireRole('secretary', 'president');
const publisherOnly = requireRole('president');

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
    doc_type: String(body.doc_type ?? '').trim(),
    body: String(body.body ?? '').trim()
  };
  const errors = [];
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  if (!DOC_TYPES.includes(old.doc_type)) {
    errors.push('Choose a document type from the list.');
  }
  if (old.body === '' || old.body.length > 10000) {
    errors.push('Document text is required (up to 10,000 characters).');
  }
  return { old, errors };
}

function toRecord(old) {
  return { title: old.title, docType: old.doc_type, body: old.body };
}

async function refuseOrNotFound(req, res, id, message) {
  const existing = await documentModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `${BASE}/${id}`);
}

function renderForm(res, status, title, action, errors, old, remarks) {
  res.status(status).render('manage/documents/form', { title, action, errors, old, remarks, docTypes: DOC_TYPES });
}

router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const documents = await documentModel.listForManage(status);
    res.render('manage/documents/index', { title: 'Manage documents', documents, status });
  } catch (err) {
    next(err);
  }
});

router.get('/new', writersOnly, (req, res) => {
  renderForm(res, 200, 'New document', BASE, [], { doc_type: 'minutes' }, null);
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = validate(req.body);
    if (errors.length > 0) return renderForm(res, 422, 'New document', BASE, errors, old, null);
    const id = await documentModel.create(toRecord(old), req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Submit it to the President when it is ready.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const doc = id ? await documentModel.findById(id) : null;
    if (!doc) return notFound(res);
    res.render('manage/documents/show', { title: doc.title, doc, errors: [], oldRemarks: '' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const doc = id ? await documentModel.findById(id) : null;
    if (!doc) return notFound(res);
    if (doc.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `${BASE}/${id}`);
    }
    renderForm(res, 200, 'Edit document', `${BASE}/${id}`, [], doc, doc.review_remarks);
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
      const existing = await documentModel.findById(id);
      if (!existing) return notFound(res);
      return renderForm(res, 422, 'Edit document', `${BASE}/${id}`, errors, old, existing.review_remarks);
    }
    const changed = await documentModel.updateDraft(id, toRecord(old));
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be edited.');
    req.session.flash = { type: 'success', message: 'Draft updated.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await documentModel.deleteDraft(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published documents are unpublished instead.');
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
    const changed = await documentModel.submit(id);
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
    const changed = await documentModel.publish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending documents can be published.');
    req.session.flash = { type: 'success', message: 'Document published on the SSC Documents page.' };
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
      const doc = await documentModel.findById(id);
      if (!doc) return notFound(res);
      return res.status(422).render('manage/documents/show', {
        title: doc.title, doc, oldRemarks: remarks,
        errors: ['Remarks are required when returning a draft (up to 500 characters).']
      });
    }
    const changed = await documentModel.returnToDraft(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending documents can be returned.');
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
    const changed = await documentModel.unpublish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only published documents can be unpublished.');
    req.session.flash = { type: 'success', message: 'Document unpublished. It is a draft again.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
