// Property Custodian and President: the items students can borrow, their availability,
// and the borrowing log (decision C19).
// Mounted in app.js with requireRole('property_custodian', 'president'), so every route
// below is already limited to those two roles.
const express = require('express');
const itemModel = require('../models/itemModel');
const itemLoanModel = require('../models/itemLoanModel');
const userModel = require('../models/userModel');
const { singlePhotoUpload, isRealImage, removeFiles, removeUploadedPhoto } = require('../middleware/upload');

const router = express.Router();

// One optional photo per item, saved in public/uploads/items/ (C27)
const itemPhoto = singlePhotoUpload('items');

const CONDITIONS = ['good', 'damaged', 'lost'];

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

// What the custodian sees when a handover is refused
const RELEASE_MESSAGES = {
  not_found: 'That item no longer exists.',
  unavailable: 'That item is marked "Not available". Change its status first.',
  not_enough: 'Not enough units are in the office right now. Some are still out on loan.',
  not_ready: 'That request is no longer waiting for a handover.'
};

// ---------- Items ----------
async function validate(body, excludeId) {
  const old = {
    name: String(body.name ?? '').trim(),
    description: String(body.description ?? '').trim(),
    quantity: String(body.quantity ?? '').trim()
  };
  const errors = [];
  if (old.name === '' || old.name.length > 100) {
    errors.push('Item name is required (up to 100 characters).');
  } else if (await itemModel.nameExists(old.name, excludeId)) {
    errors.push('An item with that name already exists.');
  }
  if (old.description.length > 255) {
    errors.push('Description must be 255 characters or fewer.');
  }
  if (!/^\d{1,4}$/.test(old.quantity) || Number(old.quantity) < 1) {
    errors.push('Quantity must be a whole number from 1 to 9999.');
  }
  return { old, errors };
}

function toRecord(old, photoPath) {
  return { name: old.name, description: old.description || null, quantity: Number(old.quantity), photoPath };
}

// currentPhoto: the saved photo shown on the edit form (null when adding)
function renderForm(res, status, title, action, errors, old, currentPhoto = null) {
  res.status(status).render('manage/items/form', { title, action, errors, old, currentPhoto });
}

// Checks the uploaded photo (optional). Returns an error message, or null when it is fine or absent.
// A refused or fake file is deleted from disk at once.
function checkPhoto(req) {
  if (req.uploadError) return req.uploadError;
  if (req.skippedFiles) return 'The photo must be a JPG, PNG or WebP image.';
  if (req.file && !isRealImage(req.file.path)) {
    removeFiles([req.file]);
    return 'That file is not a real JPG, PNG or WebP image.';
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const items = await itemModel.listForCustodian();
    res.render('manage/items/index', { title: 'Manage items', items });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  renderForm(res, 200, 'Add item', '/manage/items', [], {});
});

router.post('/', itemPhoto, async (req, res, next) => {
  try {
    const { old, errors } = await validate(req.body, null);
    const photoError = checkPhoto(req);
    if (photoError) errors.push(photoError);
    if (errors.length > 0) {
      removeFiles([req.file]); // the form is shown again, so this upload is not kept
      return renderForm(res, 422, 'Add item', '/manage/items', errors, old);
    }
    const photoPath = req.file ? `/uploads/items/${req.file.filename}` : null;
    await itemModel.create(toRecord(old, photoPath));
    req.session.flash = { type: 'success', message: 'Item added.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
    removeFiles([req.file]);
    // UNIQUE(name) is the final check if two people add the same name at once
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 422, 'Add item', '/manage/items', ['An item with that name already exists.'], req.body);
    }
    next(err);
  }
});

// ---------- Borrowing desk (before '/:id' so 'loans' is not read as an id) ----------
async function renderDesk(res, status, extra = {}) {
  const ready = await itemLoanModel.listReadyToRelease();
  const open = await itemLoanModel.listOpen();
  res.status(status).render('manage/items/desk', {
    title: 'Borrowing desk', ready, open, minDate: today(),
    errors: extra.errors || [], errorFor: extra.errorFor || null
  });
}

router.get('/loans', async (req, res, next) => {
  try {
    await renderDesk(res, 200);
  } catch (err) {
    next(err);
  }
});

// Hand over the item of an approved request
router.post('/loans/release/:transactionId', async (req, res, next) => {
  try {
    const transactionId = parseId(req.params.transactionId);
    const ready = transactionId ? (await itemLoanModel.listReadyToRelease()).find((r) => r.id === transactionId) : null;
    if (!ready) {
      req.session.flash = { type: 'error', message: RELEASE_MESSAGES.not_ready };
      return res.redirect(303, '/manage/items/loans');
    }
    const dueDate = String(req.body.due_date ?? '').trim();
    const notes = String(req.body.notes ?? '').trim();
    const errors = [];
    if (!isValidDate(dueDate) || dueDate < today()) errors.push('Enter a due date that is today or later.');
    if (notes.length > 255) errors.push('Notes must be 255 characters or fewer.');
    if (errors.length > 0) return renderDesk(res, 422, { errors, errorFor: `release-${transactionId}` });

    const result = await itemLoanModel.release({
      itemId: ready.item_id, borrowerId: ready.borrower_id, transactionId, quantity: ready.quantity,
      dueDate, notes: notes || null, releasedBy: req.user.id
    });
    if (result !== 'ok') {
      req.session.flash = { type: 'error', message: RELEASE_MESSAGES[result] };
      return res.redirect(303, '/manage/items/loans');
    }
    req.session.flash = { type: 'success', message: `${ready.item_name} handed over to ${ready.borrower_name}.` };
    res.redirect(303, '/manage/items/loans');
  } catch (err) {
    next(err);
  }
});

// ---------- Walk-in loan (no online request) ----------
async function renderWalkIn(res, status, errors, old) {
  const items = (await itemModel.listAll()).filter((i) => i.status === 'available');
  res.status(status).render('manage/items/walk-in', {
    title: 'Record a walk-in loan', items, errors, old, minDate: today()
  });
}

router.get('/loans/new', async (req, res, next) => {
  try {
    const itemId = parseId(req.query.item); // "Lend" button on an item pre-selects it
    await renderWalkIn(res, 200, [], { item_id: itemId ? String(itemId) : '', quantity: '1' });
  } catch (err) {
    next(err);
  }
});

router.post('/loans', async (req, res, next) => {
  try {
    const old = {
      student_no: String(req.body.student_no ?? '').trim(),
      item_id: String(req.body.item_id ?? '').trim(),
      quantity: String(req.body.quantity ?? '').trim(),
      due_date: String(req.body.due_date ?? '').trim(),
      notes: String(req.body.notes ?? '').trim()
    };
    const errors = [];
    const borrower = /^\d{4}-\d{5}$/.test(old.student_no) ? await userModel.findByStudentNo(old.student_no) : null;
    if (!borrower) errors.push('Enter the student number of a registered user, like 2025-10009.');
    const itemId = parseId(old.item_id);
    const item = itemId ? await itemModel.findById(itemId) : null;
    if (!item) errors.push('Choose an item.');
    if (!/^[1-9]\d{0,3}$/.test(old.quantity)) errors.push('Quantity must be a whole number from 1 to 9999.');
    if (!isValidDate(old.due_date) || old.due_date < today()) errors.push('Enter a due date that is today or later.');
    if (old.notes.length > 255) errors.push('Notes must be 255 characters or fewer.');
    if (errors.length > 0) return renderWalkIn(res, 422, errors, old);

    const result = await itemLoanModel.release({
      itemId, borrowerId: borrower.id, transactionId: null, quantity: Number(old.quantity),
      dueDate: old.due_date, notes: old.notes || null, releasedBy: req.user.id
    });
    if (result !== 'ok') return renderWalkIn(res, 422, [RELEASE_MESSAGES[result]], old);
    req.session.flash = {
      type: 'success',
      message: `${item.name} lent to ${borrower.first_name} ${borrower.last_name}. It is in the borrowing log.`
    };
    res.redirect(303, '/manage/items/loans');
  } catch (err) {
    next(err);
  }
});

// ---------- Return ----------
router.post('/loans/:loanId/return', async (req, res, next) => {
  try {
    const loanId = parseId(req.params.loanId);
    if (!loanId) return notFound(res);
    const condition = req.body.condition;
    const note = String(req.body.notes ?? '').trim();
    const errors = [];
    if (!CONDITIONS.includes(condition)) errors.push('Choose the condition the item came back in.');
    if (note.length > 255) errors.push('Notes must be 255 characters or fewer.');
    if (errors.length > 0) return renderDesk(res, 422, { errors, errorFor: `return-${loanId}` });

    const done = await itemLoanModel.markReturned(loanId, condition, note || null, req.user.id);
    if (!done) {
      req.session.flash = { type: 'error', message: 'That loan was not found or is already returned.' };
      return res.redirect(303, '/manage/items/loans');
    }
    req.session.flash = {
      type: 'success',
      message: condition === 'good'
        ? 'Marked as returned.'
        : `Marked as returned (${condition}). If it cannot be lent out, set the item to "Not available".`
    };
    res.redirect(303, '/manage/items/loans');
  } catch (err) {
    next(err);
  }
});

// ---------- One item: history, availability, edit, delete ----------
router.get('/:id/history', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const item = id ? await itemModel.findById(id) : null;
    if (!item) return notFound(res);
    const loans = await itemLoanModel.listForItem(id);
    res.render('manage/items/history', { title: `History: ${item.name}`, item, loans, errors: [], old: {} });
  } catch (err) {
    next(err);
  }
});

// Available / not available, with a reason that students see
router.post('/:id/status', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const item = id ? await itemModel.findById(id) : null;
    if (!item) return notFound(res);
    const status = req.body.status;
    const note = String(req.body.status_note ?? '').trim();
    const errors = [];
    if (!['available', 'unavailable'].includes(status)) errors.push('Choose Available or Not available.');
    if (status === 'unavailable' && note === '') errors.push('Say why it is not available, e.g. "Under repair".');
    if (note.length > 150) errors.push('The reason must be 150 characters or fewer.');
    if (errors.length > 0) {
      const loans = await itemLoanModel.listForItem(id);
      return res.status(422).render('manage/items/history', {
        title: `History: ${item.name}`, item, loans, errors, old: { status, status_note: note }
      });
    }
    await itemModel.setStatus(id, status, status === 'available' ? null : note);
    req.session.flash = {
      type: 'success',
      message: `${item.name} is now ${status === 'available' ? 'available' : 'not available'}.`
    };
    res.redirect(303, `/manage/items/${id}/history`);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const item = id ? await itemModel.findById(id) : null;
    if (!item) return notFound(res);
    renderForm(res, 200, 'Edit item', `/manage/items/${id}`, [], { ...item, quantity: String(item.quantity) },
      item.photo_path);
  } catch (err) {
    next(err);
  }
});

router.post('/:id', itemPhoto, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const item = id ? await itemModel.findById(id) : null;
    if (!item) {
      removeFiles([req.file]);
      return notFound(res);
    }
    const { old, errors } = await validate(req.body, id);
    // The stock cannot drop below the units that are out on loan right now
    if (errors.length === 0 && Number(old.quantity) < Number(item.units_out)) {
      errors.push(`${item.units_out} unit(s) are out on loan, so the quantity cannot be lower than that.`);
    }
    const photoError = checkPhoto(req);
    if (photoError) errors.push(photoError);
    if (errors.length > 0) {
      removeFiles([req.file]);
      return renderForm(res, 422, 'Edit item', `/manage/items/${id}`, errors, old, item.photo_path);
    }

    // A new upload replaces the photo; the "Remove photo" box clears it; otherwise it stays
    let photoPath = item.photo_path;
    if (req.file) photoPath = `/uploads/items/${req.file.filename}`;
    else if (req.body.remove_photo === '1') photoPath = null;

    const changed = await itemModel.update(id, toRecord(old, photoPath));
    if (changed === 0) {
      removeFiles([req.file]);
      return notFound(res);
    }
    // The old file is deleted only after the database points to the new one
    if (item.photo_path && item.photo_path !== photoPath) removeUploadedPhoto(item.photo_path);
    req.session.flash = { type: 'success', message: 'Item updated.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
    removeFiles([req.file]);
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 422, 'Edit item', `/manage/items/${req.params.id}`,
        ['An item with that name already exists.'], req.body);
    }
    next(err);
  }
});

router.post('/:id/delete', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const before = await itemModel.findById(id);
    const changed = await itemModel.removeIfUnused(id);
    if (changed === 0) {
      const item = await itemModel.findById(id);
      if (!item) return notFound(res);
      req.session.flash = {
        type: 'error',
        message: `"${item.name}" has requests in progress or a borrowing history, so it is kept. Mark it "Not available" instead.`
      };
      return res.redirect(303, '/manage/items');
    }
    if (before && before.photo_path) removeUploadedPhoto(before.photo_path);
    req.session.flash = { type: 'success', message: 'Item deleted.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
