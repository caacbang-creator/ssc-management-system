// PRO and President: manage the items students can borrow.
// Mounted in app.js with requireRole('pro', 'president').
const express = require('express');
const itemModel = require('../models/itemModel');

const router = express.Router();

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

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

function toRecord(old) {
  return { name: old.name, description: old.description || null, quantity: Number(old.quantity) };
}

function renderForm(res, status, title, action, errors, old) {
  res.status(status).render('manage/items/form', { title, action, errors, old });
}

router.get('/', async (req, res, next) => {
  try {
    const items = await itemModel.listAll();
    res.render('manage/items/index', { title: 'Manage items', items });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  renderForm(res, 200, 'Add item', '/manage/items', [], {});
});

router.post('/', async (req, res, next) => {
  try {
    const { old, errors } = await validate(req.body, null);
    if (errors.length > 0) return renderForm(res, 422, 'Add item', '/manage/items', errors, old);
    await itemModel.create(toRecord(old));
    req.session.flash = { type: 'success', message: 'Item added.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
    // UNIQUE(name) is the final check if two people add the same name at once
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 422, 'Add item', '/manage/items', ['An item with that name already exists.'], req.body);
    }
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const item = id ? await itemModel.findById(id) : null;
    if (!item) return notFound(res);
    renderForm(res, 200, 'Edit item', `/manage/items/${id}`, [], { ...item, quantity: String(item.quantity) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { old, errors } = await validate(req.body, id);
    if (errors.length > 0) return renderForm(res, 422, 'Edit item', `/manage/items/${id}`, errors, old);
    const changed = await itemModel.update(id, toRecord(old));
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Item updated.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
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
    const changed = await itemModel.removeIfUnused(id);
    if (changed === 0) {
      const item = await itemModel.findById(id);
      if (!item) return notFound(res);
      req.session.flash = {
        type: 'error',
        message: `"${item.name}" has requests in progress and cannot be deleted yet.`
      };
      return res.redirect(303, '/manage/items');
    }
    req.session.flash = { type: 'success', message: 'Item deleted.' };
    res.redirect(303, '/manage/items');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
