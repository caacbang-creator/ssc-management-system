// Financial reports: the Treasurer submits, ONLY the President publishes (decision C2-B).
// Mounted in app.js with requireRole('treasurer', 'vp_internal', 'president').
//   writers (Treasurer, President): create, edit, delete drafts, submit
//   publisher (President): publish, return with remarks, unpublish
//   VP Internal: read-only
const express = require('express');
const financialReportModel = require('../models/financialReportModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const BASE = '/manage/financial-reports';
const STATUSES = ['draft', 'pending', 'published'];
const writersOnly = requireRole('treasurer', 'president');
const publisherOnly = requireRole('president');
// Money: up to 10 digits and 2 decimals, e.g. 15000 or 12350.50 (commas are allowed and removed)
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

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

function validate(body) {
  const old = {
    title: String(body.title ?? '').trim(),
    period_start: String(body.period_start ?? '').trim(),
    period_end: String(body.period_end ?? '').trim(),
    budget: String(body.budget ?? '').trim().replace(/,/g, ''),
    expenses: String(body.expenses ?? '').trim().replace(/,/g, ''),
    notes: String(body.notes ?? '').trim()
  };
  const errors = [];
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  const startOk = isValidDate(old.period_start);
  const endOk = isValidDate(old.period_end);
  if (!startOk) errors.push('Enter a valid start date for the period.');
  if (!endOk) errors.push('Enter a valid end date for the period.');
  if (startOk && endOk && old.period_end < old.period_start) {
    errors.push('The period end cannot be before the period start.');
  }
  if (!MONEY_PATTERN.test(old.budget)) {
    errors.push('Budget must be an amount like 15000 or 15000.50 (no negative numbers).');
  }
  if (!MONEY_PATTERN.test(old.expenses)) {
    errors.push('Expenses must be an amount like 12350 or 12350.50 (no negative numbers).');
  }
  if (old.notes.length > 5000) {
    errors.push('Notes must be 5,000 characters or fewer.');
  }
  return { old, errors };
}

function toRecord(old) {
  return {
    title: old.title,
    periodStart: old.period_start,
    periodEnd: old.period_end,
    budget: old.budget,
    expenses: old.expenses,
    notes: old.notes || null
  };
}

async function refuseOrNotFound(req, res, id, message) {
  const existing = await financialReportModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `${BASE}/${id}`);
}

function renderForm(res, status, title, action, errors, old, remarks) {
  res.status(status).render('manage/financial-reports/form', { title, action, errors, old, remarks });
}

router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const reports = await financialReportModel.listForManage(status);
    res.render('manage/financial-reports/index', { title: 'Manage financial reports', reports, status });
  } catch (err) {
    next(err);
  }
});

router.get('/new', writersOnly, (req, res) => {
  renderForm(res, 200, 'New financial report', BASE, [], {}, null);
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = validate(req.body);
    if (errors.length > 0) return renderForm(res, 422, 'New financial report', BASE, errors, old, null);
    const id = await financialReportModel.create(toRecord(old), req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Submit it to the President when it is ready.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    res.render('manage/financial-reports/show', { title: report.title, report, errors: [], oldRemarks: '' });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    if (report.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `${BASE}/${id}`);
    }
    renderForm(res, 200, 'Edit financial report', `${BASE}/${id}`, [], report, report.review_remarks);
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
      const existing = await financialReportModel.findById(id);
      if (!existing) return notFound(res);
      return renderForm(res, 422, 'Edit financial report', `${BASE}/${id}`, errors, old, existing.review_remarks);
    }
    const changed = await financialReportModel.updateDraft(id, toRecord(old));
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
    const changed = await financialReportModel.deleteDraft(id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only drafts can be deleted. Published reports are unpublished instead.');
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
    const changed = await financialReportModel.submit(id);
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
    const changed = await financialReportModel.publish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending reports can be published.');
    req.session.flash = { type: 'success', message: 'Report published on the SSC Documents page.' };
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
      const report = await financialReportModel.findById(id);
      if (!report) return notFound(res);
      return res.status(422).render('manage/financial-reports/show', {
        title: report.title, report, oldRemarks: remarks,
        errors: ['Remarks are required when returning a draft (up to 500 characters).']
      });
    }
    const changed = await financialReportModel.returnToDraft(id, req.user.id, remarks);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only pending reports can be returned.');
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
    const changed = await financialReportModel.unpublish(id, req.user.id);
    if (changed === 0) return refuseOrNotFound(req, res, id, 'Only published reports can be unpublished.');
    req.session.flash = { type: 'success', message: 'Report unpublished. It is a draft again.' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
