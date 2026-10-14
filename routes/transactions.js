// Student requests: clearance appointment, item borrowing, SSC appointment.
// Mounted in app.js with requireLogin: every page here needs a logged-in user.
const express = require('express');
const transactionModel = require('../models/transactionModel');
const itemModel = require('../models/itemModel');

const router = express.Router();

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

// Checks the common fields, then only the fields that belong to the chosen type.
// Returns { old, errors, record }.
async function validate(body, types) {
  const old = {
    type: String(body.type ?? '').trim(),
    purpose: String(body.purpose ?? '').trim(),
    preferred_date: String(body.preferred_date ?? '').trim(),
    preferred_time: String(body.preferred_time ?? '').trim(),
    item_id: String(body.item_id ?? '').trim(),
    quantity: String(body.quantity ?? '').trim(),
    return_date: String(body.return_date ?? '').trim()
  };
  const errors = [];

  if (!Object.keys(types).includes(old.type)) {
    errors.push('Choose a request type.');
  }
  if (old.purpose === '' || old.purpose.length > 500) {
    errors.push('Purpose is required (up to 500 characters).');
  }
  const dateOk = isValidDate(old.preferred_date);
  if (!dateOk) {
    errors.push('Enter a valid date.');
  } else if (old.preferred_date < today()) {
    errors.push('The date cannot be in the past.');
  }

  // Fields that do not belong to the chosen type are saved as NULL
  const record = {
    type: old.type,
    purpose: old.purpose,
    preferredDate: old.preferred_date,
    preferredTime: null,
    itemId: null,
    quantity: null,
    returnDate: null
  };

  if (old.type === 'clearance_appointment' || old.type === 'ssc_appointment') {
    if (!isValidTime(old.preferred_time)) {
      errors.push('Enter a preferred time for the appointment.');
    }
    record.preferredTime = old.preferred_time;
  }

  if (old.type === 'item_borrowing') {
    const itemId = parseId(old.item_id);
    const item = itemId ? await itemModel.findById(itemId) : null;
    if (!item) {
      errors.push('Choose an item to borrow.');
    }
    const quantity = /^\d{1,4}$/.test(old.quantity) ? Number(old.quantity) : 0;
    if (quantity < 1) {
      errors.push('Quantity must be a whole number of at least 1.');
    } else if (item && quantity > item.quantity) {
      errors.push(`Only ${item.quantity} of "${item.name}" can be borrowed.`);
    }
    if (!isValidDate(old.return_date)) {
      errors.push('Enter a valid return date.');
    } else if (dateOk && old.return_date < old.preferred_date) {
      errors.push('The return date cannot be before the borrowing date.');
    }
    record.itemId = itemId;
    record.quantity = quantity;
    record.returnDate = old.return_date;
  }

  return { old, errors, record };
}

async function renderForm(req, res, status, errors, old) {
  const items = await itemModel.listAll();
  res.status(status).render('transactions/new', {
    title: 'New request', errors, old, items, minDate: today()
  });
}

// ---------- My requests ----------
router.get('/', async (req, res, next) => {
  try {
    const transactions = await transactionModel.listForUser(req.user.id);
    res.render('transactions/my', { title: 'My requests', transactions });
  } catch (err) {
    next(err);
  }
});

// ---------- New request ----------
router.get('/new', async (req, res, next) => {
  try {
    // ?type=item_borrowing pre-selects the type (only if it is a known type)
    const types = req.app.locals.transactionTypes;
    const type = Object.keys(types).includes(req.query.type) ? req.query.type : '';
    await renderForm(req, res, 200, [], { type });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { old, errors, record } = await validate(req.body, req.app.locals.transactionTypes);
    if (errors.length > 0) {
      return renderForm(req, res, 422, errors, old);
    }
    const id = await transactionModel.create(record, req.user.id);
    req.session.flash = { type: 'success', message: 'Request submitted. The SSC will review it.' };
    res.redirect(303, `/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- One of my requests ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const transaction = id ? await transactionModel.findOwn(id, req.user.id) : null;
    if (!transaction) return notFound(res);
    res.render('transactions/show', { title: `Request ${transaction.reference_no}`, transaction });
  } catch (err) {
    next(err);
  }
});

// ---------- Cancel (owner, while pending) ----------
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await transactionModel.cancelOwn(id, req.user.id);
    if (changed === 0) {
      // Not yours (or missing) -> 404. Yours but no longer pending -> refused.
      const own = await transactionModel.findOwn(id, req.user.id);
      if (!own) return notFound(res);
      req.session.flash = { type: 'error', message: 'Only pending requests can be cancelled.' };
      return res.redirect(303, `/transactions/${id}`);
    }
    req.session.flash = { type: 'success', message: 'Request cancelled.' };
    res.redirect(303, `/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
