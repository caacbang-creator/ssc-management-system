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

// ---------- The report sheet (new and edit) ----------
// Creating or editing a draft is ONE page laid out like the published report: the title and
// period, the Expenses table, the Sales summary table and the notes. Every cell is an input;
// saved lines have a "Remove" box and blank rows at the bottom are new lines. One POST saves
// everything in one transaction (C18). No JavaScript: "Save and add more rows" saves, then
// comes back to the sheet with more blank rows.
const MAX_ROWS = 100;
const BLANK_ROWS = { expenses: 5, sales: 3 };
const MORE_ROWS = 8;

// The two tables share one form, so their id and remove fields have different names
const TABLES = {
  expenses: {
    label: 'Receipts',
    idField: 'x_id',
    removeField: 'x_remove',
    fields: ['item', 'receipt_no', 'receipt_date', 'particulars', 'amount'],
    validate: validateExpense,
    toRecord: toExpense,
    toRow: (x) => ({
      item: x.item,
      receipt_no: x.receipt_no || '',
      receipt_date: String(x.receipt_date).slice(0, 10),
      particulars: x.particulars,
      amount: Number(x.amount).toFixed(2)
    })
  },
  sales: {
    label: 'Sales',
    idField: 's_id',
    removeField: 's_remove',
    fields: ['product', 'quantity', 'unit_price'],
    validate: validateSale,
    toRecord: toSale,
    toRow: (s) => ({ product: s.product, quantity: String(s.quantity), unit_price: Number(s.unit_price).toFixed(2) })
  }
};

// One value -> [value]; several -> the array; none -> []
function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// Blank rows for new lines
function blankRows(table, count) {
  return Array.from({ length: count }, () => {
    const row = { id: '', remove: false };
    table.fields.forEach((field) => { row[field] = ''; });
    return row;
  });
}

// A table as the sheet shows it: the saved lines, then blank rows
function tableState(kind, lines, blanks) {
  const table = TABLES[kind];
  const rows = lines.map((line) => ({ ...table.toRow(line), id: String(line.id), remove: false }));
  return { rows: rows.concat(blankRows(table, blanks)), errorRows: [] };
}

// Reads one table from the form. Every row sends every field (and an id, empty for a new row),
// so the arrays line up by position. Returns null if they don't (a tampered form).
function readRows(body, table) {
  const ids = toArray(body[table.idField]);
  const columns = table.fields.map((field) => toArray(body[field]));
  if (columns.some((column) => column.length !== ids.length)) return null;
  const removed = new Set(toArray(body[table.removeField]).map(String));
  return ids.map((rawId, i) => {
    const row = { id: String(rawId).trim() };
    table.fields.forEach((field, k) => { row[field] = String(columns[k][i]); });
    row.remove = row.id !== '' && removed.has(row.id);
    return row;
  });
}

// Checks every row of one table. ownIds: the ids of this report's saved lines (any other id is
// refused). Returns { plan, errors, errorRows }; empty new rows are skipped.
function checkRows(rows, table, ownIds) {
  const plan = { removeIds: [], updates: [], inserts: [] };
  const errors = [];
  const errorRows = [];
  if (rows.length > MAX_ROWS) errors.push(`${table.label}: save at most ${MAX_ROWS} rows at a time.`);
  rows.forEach((row, i) => {
    if (row.id !== '') {
      if (!ownIds.has(row.id)) {
        errors.push(`${table.label}, row ${i + 1}: this line is no longer in the report. Reload the page.`);
        errorRows.push(i);
        return;
      }
      if (row.remove) {
        plan.removeIds.push(Number(row.id));
        return;
      }
    } else if (table.fields.every((field) => row[field].trim() === '')) {
      return;
    }
    const { old, errors: rowErrors } = table.validate(row);
    if (rowErrors.length > 0) {
      errorRows.push(i);
      rowErrors.forEach((message) => errors.push(`${table.label}, row ${i + 1}: ${message}`));
      return;
    }
    const record = table.toRecord(old);
    if (row.id !== '') plan.updates.push({ ...record, id: Number(row.id) });
    else plan.inserts.push(record);
  });
  return { plan, errors, errorRows };
}

// The sheet page. sheet: { title, action, old, remarks, errors, tables, savedExpenses, savedSales }
function renderSheet(req, res, status, sheet) {
  res.status(status).render('manage/financial-reports/form', {
    ...sheet,
    yearChoices: schoolYearChoices(req)
  });
}

// Reads and checks the whole sheet. ownLines: { expenses, sales } saved lines of the report
// ([] for a new one). Returns { old, record, errors, tables, plans }.
function readSheet(body, ownLines) {
  const { old, errors } = validate(body);
  const tables = {};
  const plans = {};
  for (const kind of ['expenses', 'sales']) {
    const table = TABLES[kind];
    const rows = readRows(body, table);
    if (!rows) {
      errors.push(`${table.label}: the table could not be read. Reload the page and try again.`);
      tables[kind] = tableState(kind, ownLines[kind], BLANK_ROWS[kind]);
      continue;
    }
    const ownIds = new Set(ownLines[kind].map((line) => String(line.id)));
    const checked = checkRows(rows, table, ownIds);
    errors.push(...checked.errors);
    tables[kind] = { rows, errorRows: checked.errorRows };
    plans[kind] = checked.plan;
  }
  return { old, record: toRecord(old), errors, tables, plans };
}

// After a save: back to the sheet with more blank rows, or to the report page
function afterSave(req, res, id, message) {
  req.session.flash = { type: 'success', message };
  const more = req.body.more;
  if (more === 'expenses' || more === 'sales') {
    return res.redirect(303, `${BASE}/${id}/edit?more=${more}#${more}`);
  }
  res.redirect(303, `${BASE}/${id}`);
}

// The report page (read-only, laid out like the published report). extra: the President's
// "send back" form errors and typed remarks.
async function renderShow(res, status, report, extra = {}) {
  const expenses = await financialExpenseModel.listForReport(report.id);
  const sales = await financialSaleModel.listForReport(report.id);
  res.status(status).render('manage/financial-reports/show', {
    title: report.title,
    report,
    expenses,
    sales,
    errors: extra.errors || [],
    oldRemarks: extra.oldRemarks || ''
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
  renderSheet(req, res, 200, {
    title: 'New financial report',
    action: BASE,
    old: { school_year: req.app.locals.schoolYearOf() },
    remarks: null,
    errors: [],
    tables: { expenses: tableState('expenses', [], BLANK_ROWS.expenses), sales: tableState('sales', [], BLANK_ROWS.sales) },
    savedExpenses: [],
    savedSales: []
  });
});

router.post('/', writersOnly, async (req, res, next) => {
  try {
    const sheet = readSheet(req.body, { expenses: [], sales: [] });
    if (sheet.errors.length > 0) {
      return renderSheet(req, res, 422, {
        title: 'New financial report', action: BASE, old: sheet.old, remarks: null,
        errors: sheet.errors, tables: sheet.tables, savedExpenses: [], savedSales: []
      });
    }
    const saved = await financialReportModel.saveSheet(null, sheet.record, req.user.id,
      sheet.plans.expenses, sheet.plans.sales);
    afterSave(req, res, saved.id, 'Draft saved. Check it, then send it to the President.');
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

// ---------- Edit (drafts only): the same sheet, filled in ----------
// Loads a draft and its lines; null = a response was already sent (404 or "only drafts")
async function findDraft(req, res) {
  const id = parseId(req.params.id);
  const report = id ? await financialReportModel.findById(id) : null;
  if (!report) {
    notFound(res);
    return null;
  }
  if (report.status !== 'draft') {
    req.session.flash = { type: 'error', message: 'Only drafts can be edited.' };
    res.redirect(303, `${BASE}/${id}`);
    return null;
  }
  const expenses = await financialExpenseModel.listForReport(id);
  const sales = await financialSaleModel.listForReport(id);
  return { report, expenses, sales };
}

router.get('/:id/edit', writersOnly, async (req, res, next) => {
  try {
    const found = await findDraft(req, res);
    if (!found) return;
    const { report, expenses, sales } = found;
    // ?more=expenses (after "Save and add more rows") gives that table extra blank rows
    const blanks = (kind) => (req.query.more === kind ? MORE_ROWS : BLANK_ROWS[kind]);
    renderSheet(req, res, 200, {
      title: 'Edit financial report',
      action: `${BASE}/${report.id}`,
      old: report,
      remarks: report.review_remarks,
      errors: [],
      tables: { expenses: tableState('expenses', expenses, blanks('expenses')), sales: tableState('sales', sales, blanks('sales')) },
      savedExpenses: expenses,
      savedSales: sales
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', writersOnly, async (req, res, next) => {
  try {
    const found = await findDraft(req, res);
    if (!found) return;
    const { report, expenses, sales } = found;
    const sheet = readSheet(req.body, { expenses, sales });
    if (sheet.errors.length > 0) {
      return renderSheet(req, res, 422, {
        title: 'Edit financial report', action: `${BASE}/${report.id}`, old: sheet.old,
        remarks: report.review_remarks, errors: sheet.errors, tables: sheet.tables,
        savedExpenses: expenses, savedSales: sales
      });
    }
    const saved = await financialReportModel.saveSheet(report.id, sheet.record, req.user.id,
      sheet.plans.expenses, sheet.plans.sales);
    if (saved.result === 'locked') return refuseOrNotFound(req, res, report.id, 'Only drafts can be edited.');
    afterSave(req, res, report.id, 'Draft saved.');
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
