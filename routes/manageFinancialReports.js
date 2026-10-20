// Financial reports: the Treasurer submits, ONLY the President publishes (decision C2-B).
// Mounted in app.js with requireRole('treasurer', 'vp_internal', 'president').
//   writers (Treasurer, President): create, edit, delete drafts, submit, expense and sales
//     lines (drafts only), the annual budget
//   publisher (President): publish, return with remarks, unpublish
//   VP Internal: read-only
// A report's totals are computed from its lines; the year's spending is computed against
// the annual budget (C18). Nothing is typed in twice.
const express = require('express');
const financialReportModel = require('../models/financialReportModel');
const financialExpenseModel = require('../models/financialExpenseModel');
const financialSaleModel = require('../models/financialSaleModel');
const annualBudgetModel = require('../models/annualBudgetModel');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const BASE = '/manage/financial-reports';
const STATUSES = ['draft', 'pending', 'published'];
const writersOnly = requireRole('treasurer', 'president');
const publisherOnly = requireRole('president');
// Money: up to 10 digits and 2 decimals, e.g. 15000 or 12350.50 (commas are allowed and removed)
const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const LINES_LOCKED = 'Lines can only be changed while the report is a draft.';

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

// '2026-2027' is valid; '2026-2028' or '26-27' are not
function isValidSchoolYear(value) {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  return Boolean(match) && Number(match[2]) === Number(match[1]) + 1 && Number(match[1]) >= 2000;
}

// The year before, this year and the year after (choices on the report form)
function schoolYearChoices(req) {
  const current = req.app.locals.schoolYearOf();
  const start = Number(current.slice(0, 4));
  return [`${start - 1}-${start}`, current, `${start + 1}-${start + 2}`];
}

// ---------- Report details ----------
function validate(body) {
  const old = {
    title: String(body.title ?? '').trim(),
    school_year: String(body.school_year ?? '').trim(),
    period_start: String(body.period_start ?? '').trim(),
    period_end: String(body.period_end ?? '').trim(),
    notes: String(body.notes ?? '').trim()
  };
  const errors = [];
  if (old.title === '' || old.title.length > 150) {
    errors.push('Title is required (up to 150 characters).');
  }
  if (!isValidSchoolYear(old.school_year)) {
    errors.push('Choose the school year this report belongs to.');
  }
  const startOk = isValidDate(old.period_start);
  const endOk = isValidDate(old.period_end);
  if (!startOk) errors.push('Enter a valid start date for the period.');
  if (!endOk) errors.push('Enter a valid end date for the period.');
  if (startOk && endOk && old.period_end < old.period_start) {
    errors.push('The period end cannot be before the period start.');
  }
  if (old.notes.length > 5000) {
    errors.push('Notes must be 5,000 characters or fewer.');
  }
  return { old, errors };
}

function toRecord(old) {
  return {
    title: old.title,
    schoolYear: old.school_year,
    periodStart: old.period_start,
    periodEnd: old.period_end,
    notes: old.notes || null
  };
}

// ---------- Expense and sales lines ----------
function validateExpense(body) {
  const old = {
    item: String(body.item ?? '').trim(),
    receipt_no: String(body.receipt_no ?? '').trim(),
    receipt_date: String(body.receipt_date ?? '').trim(),
    particulars: String(body.particulars ?? '').trim(),
    amount: String(body.amount ?? '').trim().replace(/,/g, '')
  };
  const errors = [];
  if (old.item === '' || old.item.length > 60) errors.push('Item is required (up to 60 characters), e.g. Meals.');
  if (old.receipt_no !== '' && !/^[A-Za-z0-9-]{1,30}$/.test(old.receipt_no)) {
    errors.push('Receipt number: letters, numbers and hyphens only (up to 30). Leave it empty if there is none.');
  }
  if (!isValidDate(old.receipt_date)) errors.push('Enter a valid receipt date.');
  if (old.particulars === '' || old.particulars.length > 150) {
    errors.push('Particulars are required (up to 150 characters), e.g. the store name.');
  }
  if (!MONEY_PATTERN.test(old.amount) || Number(old.amount) <= 0) {
    errors.push('Amount must be more than zero, like 58 or 461.75.');
  }
  return { old, errors };
}

function toExpense(old) {
  return {
    item: old.item,
    receiptNo: old.receipt_no || null,
    receiptDate: old.receipt_date,
    particulars: old.particulars,
    amount: old.amount
  };
}

function validateSale(body) {
  const old = {
    product: String(body.product ?? '').trim(),
    quantity: String(body.quantity ?? '').trim(),
    unit_price: String(body.unit_price ?? '').trim().replace(/,/g, '')
  };
  const errors = [];
  if (old.product === '' || old.product.length > 100) errors.push('Product is required (up to 100 characters).');
  if (!/^[1-9]\d{0,4}$/.test(old.quantity)) errors.push('Quantity sold must be a whole number from 1 to 99999.');
  if (!MONEY_PATTERN.test(old.unit_price)) errors.push('Unit price must be an amount like 15 or 20.50.');
  return { old, errors };
}

function toSale(old) {
  return { product: old.product, quantity: Number(old.quantity), unitPrice: old.unit_price };
}

// ---------- Rendering helpers ----------
async function refuseOrNotFound(req, res, id, message) {
  const existing = await financialReportModel.findById(id);
  if (!existing) return notFound(res);
  req.session.flash = { type: 'error', message };
  res.redirect(303, `${BASE}/${id}`);
}

function renderForm(req, res, status, title, action, errors, old, remarks) {
  res.status(status).render('manage/financial-reports/form', {
    title, action, errors, old, remarks, yearChoices: schoolYearChoices(req)
  });
}

// The report page with its lines. extra: errors for the remarks form, or for one of the
// "add line" forms (lineForm = 'expense' or 'sale') with the values typed in.
async function renderShow(res, status, report, extra = {}) {
  const expenses = await financialExpenseModel.listForReport(report.id);
  const sales = await financialSaleModel.listForReport(report.id);
  res.status(status).render('manage/financial-reports/show', {
    title: report.title,
    report,
    expenses,
    sales,
    errors: extra.errors || [],
    oldRemarks: extra.oldRemarks || '',
    lineForm: extra.lineForm || '',
    lineErrors: extra.lineErrors || [],
    oldLine: extra.oldLine || {}
  });
}

// ---------- List ----------
router.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.includes(req.query.status) ? req.query.status : '';
    const reports = await financialReportModel.listForManage(status);
    res.render('manage/financial-reports/index', { title: 'Manage financial reports', reports, status });
  } catch (err) {
    next(err);
  }
});

// ---------- Annual budget (before '/:id' so 'budget' is not read as an id) ----------
async function renderBudget(req, res, status, errors, old) {
  const schoolYear = req.app.locals.schoolYearOf();
  const budget = await annualBudgetModel.find(schoolYear);
  const totals = await financialReportModel.yearTotals(schoolYear);
  res.status(status).render('manage/financial-reports/budget', {
    title: 'Annual budget', schoolYear, budget, totals, errors,
    old: old || { amount: budget ? String(budget.amount) : '' }
  });
}

router.get('/budget', async (req, res, next) => {
  try {
    await renderBudget(req, res, 200, [], null);
  } catch (err) {
    next(err);
  }
});

router.post('/budget', writersOnly, async (req, res, next) => {
  try {
    const old = { amount: String(req.body.amount ?? '').trim().replace(/,/g, '') };
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(old.amount)) {
      return renderBudget(req, res, 422, ['Budget must be an amount like 1000000 or 1000000.00.'], old);
    }
    await annualBudgetModel.save(req.app.locals.schoolYearOf(), old.amount, req.user.id);
    req.session.flash = { type: 'success', message: 'Annual budget saved.' };
    res.redirect(303, `${BASE}/budget`);
  } catch (err) {
    next(err);
  }
});

// ---------- Create ----------
router.get('/new', writersOnly, (req, res) => {
  renderForm(req, res, 200, 'New financial report', BASE, [], { school_year: req.app.locals.schoolYearOf() }, null);
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const { old, errors } = validate(req.body);
    if (errors.length > 0) return renderForm(req, res, 422, 'New financial report', BASE, errors, old, null);
    const id = await financialReportModel.create(toRecord(old), req.user.id);
    req.session.flash = { type: 'success', message: 'Draft saved. Now add the receipts (and sales, if any).' };
    res.redirect(303, `${BASE}/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- View one ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    await renderShow(res, 200, report);
  } catch (err) {
    next(err);
  }
});

// ---------- Edit details (drafts only) ----------
router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    if (report.status !== 'draft') {
      req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
      return res.redirect(303, `${BASE}/${id}`);
    }
    renderForm(req, res, 200, 'Edit financial report', `${BASE}/${id}`, [], report, report.review_remarks);
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
      return renderForm(req, res, 422, 'Edit financial report', `${BASE}/${id}`, errors, old, existing.review_remarks);
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

// ---------- Expense lines (drafts only) ----------
router.post('/:id/expenses', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    const { old, errors } = validateExpense(req.body);
    if (errors.length > 0) {
      return renderShow(res, 422, report, { lineForm: 'expense', lineErrors: errors, oldLine: old });
    }
    const added = await financialExpenseModel.add(id, toExpense(old));
    if (added === 0) return refuseOrNotFound(req, res, id, LINES_LOCKED);
    req.session.flash = { type: 'success', message: 'Receipt added.' };
    res.redirect(303, `${BASE}/${id}#expenses`);
  } catch (err) {
    next(err);
  }
});

// Loads the report (draft) and one of its expense lines for the edit page; null = response sent
async function findExpenseLine(req, res) {
  const id = parseId(req.params.id);
  const lineId = parseId(req.params.lineId);
  const report = id ? await financialReportModel.findById(id) : null;
  const line = report && lineId ? await financialExpenseModel.findInReport(id, lineId) : null;
  if (!report || !line) {
    notFound(res);
    return null;
  }
  if (report.status !== 'draft') {
    req.session.flash = { type: 'error', message: LINES_LOCKED };
    res.redirect(303, `${BASE}/${id}`);
    return null;
  }
  return { report, line };
}

router.get('/:id/expenses/:lineId/edit', writersOnly, async (req, res, next) => {
  try {
    const found = await findExpenseLine(req, res);
    if (!found) return;
    const { report, line } = found;
    res.render('manage/financial-reports/expense-form', {
      title: 'Edit receipt', report, lineId: line.id, errors: [],
      old: { ...line, receipt_no: line.receipt_no || '', receipt_date: String(line.receipt_date).slice(0, 10) }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/expenses/:lineId', writersOnly, async (req, res, next) => {
  try {
    const found = await findExpenseLine(req, res);
    if (!found) return;
    const { report, line } = found;
    const { old, errors } = validateExpense(req.body);
    if (errors.length > 0) {
      return res.status(422).render('manage/financial-reports/expense-form', {
        title: 'Edit receipt', report, lineId: line.id, errors, old
      });
    }
    const changed = await financialExpenseModel.update(report.id, line.id, toExpense(old));
    if (changed === 0) return refuseOrNotFound(req, res, report.id, LINES_LOCKED);
    req.session.flash = { type: 'success', message: 'Receipt updated.' };
    res.redirect(303, `${BASE}/${report.id}#expenses`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/expenses/:lineId/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const lineId = parseId(req.params.lineId);
    if (!id || !lineId) return notFound(res);
    const removed = await financialExpenseModel.remove(id, lineId);
    if (removed === 0) {
      // Not this report's line -> 404; this report's line but not a draft -> refused
      const line = await financialExpenseModel.findInReport(id, lineId);
      if (!line) return notFound(res);
      return refuseOrNotFound(req, res, id, LINES_LOCKED);
    }
    req.session.flash = { type: 'success', message: 'Receipt removed.' };
    res.redirect(303, `${BASE}/${id}#expenses`);
  } catch (err) {
    next(err);
  }
});

// ---------- Sales lines (drafts only) ----------
router.post('/:id/sales', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const report = id ? await financialReportModel.findById(id) : null;
    if (!report) return notFound(res);
    const { old, errors } = validateSale(req.body);
    if (errors.length > 0) {
      return renderShow(res, 422, report, { lineForm: 'sale', lineErrors: errors, oldLine: old });
    }
    const added = await financialSaleModel.add(id, toSale(old));
    if (added === 0) return refuseOrNotFound(req, res, id, LINES_LOCKED);
    req.session.flash = { type: 'success', message: 'Sales line added.' };
    res.redirect(303, `${BASE}/${id}#sales`);
  } catch (err) {
    next(err);
  }
});

async function findSaleLine(req, res) {
  const id = parseId(req.params.id);
  const lineId = parseId(req.params.lineId);
  const report = id ? await financialReportModel.findById(id) : null;
  const line = report && lineId ? await financialSaleModel.findInReport(id, lineId) : null;
  if (!report || !line) {
    notFound(res);
    return null;
  }
  if (report.status !== 'draft') {
    req.session.flash = { type: 'error', message: LINES_LOCKED };
    res.redirect(303, `${BASE}/${id}`);
    return null;
  }
  return { report, line };
}

router.get('/:id/sales/:lineId/edit', writersOnly, async (req, res, next) => {
  try {
    const found = await findSaleLine(req, res);
    if (!found) return;
    const { report, line } = found;
    res.render('manage/financial-reports/sale-form', {
      title: 'Edit sales line', report, lineId: line.id, errors: [],
      old: { ...line, quantity: String(line.quantity), unit_price: String(line.unit_price) }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sales/:lineId', writersOnly, async (req, res, next) => {
  try {
    const found = await findSaleLine(req, res);
    if (!found) return;
    const { report, line } = found;
    const { old, errors } = validateSale(req.body);
    if (errors.length > 0) {
      return res.status(422).render('manage/financial-reports/sale-form', {
        title: 'Edit sales line', report, lineId: line.id, errors, old
      });
    }
    const changed = await financialSaleModel.update(report.id, line.id, toSale(old));
    if (changed === 0) return refuseOrNotFound(req, res, report.id, LINES_LOCKED);
    req.session.flash = { type: 'success', message: 'Sales line updated.' };
    res.redirect(303, `${BASE}/${report.id}#sales`);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/sales/:lineId/delete', writersOnly, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const lineId = parseId(req.params.lineId);
    if (!id || !lineId) return notFound(res);
    const removed = await financialSaleModel.remove(id, lineId);
    if (removed === 0) {
      const line = await financialSaleModel.findInReport(id, lineId);
      if (!line) return notFound(res);
      return refuseOrNotFound(req, res, id, LINES_LOCKED);
    }
    req.session.flash = { type: 'success', message: 'Sales line removed.' };
    res.redirect(303, `${BASE}/${id}#sales`);
  } catch (err) {
    next(err);
  }
});

// ---------- Workflow ----------
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
      return renderShow(res, 422, report, {
        oldRemarks: remarks,
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
