// PRO and President: manage the officer directory.
// Protected at the mount in app.js with requireRole('pro', 'president').
const express = require('express');
const officerModel = require('../models/officerModel');
const committeeModel = require('../models/committeeModel');

const router = express.Router();

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// Reads and checks the form. Returns { old, errors }.
async function validate(body) {
  const old = {
    full_name: String(body.full_name ?? '').trim(),
    position: String(body.position ?? '').trim(),
    committee_id: String(body.committee_id ?? '').trim(),
    term: String(body.term ?? '').trim(),
    sort_order: String(body.sort_order ?? '').trim()
  };
  const errors = [];

  if (old.full_name === '' || old.full_name.length > 120) {
    errors.push('Full name is required (up to 120 characters).');
  }
  if (old.position === '' || old.position.length > 100) {
    errors.push('Position is required (up to 100 characters).');
  }
  // Committee is optional; if given, it must be a real committee
  if (old.committee_id !== '') {
    const committeeId = parseId(old.committee_id);
    if (!committeeId || !(await committeeModel.findById(committeeId))) {
      errors.push('Choose a committee from the list.');
    }
  }
  // Term like 2026-2027: the second year must be the next year
  const termMatch = /^(\d{4})-(\d{4})$/.exec(old.term);
  if (!termMatch || Number(termMatch[2]) !== Number(termMatch[1]) + 1) {
    errors.push('Term must look like 2026-2027.');
  }
  if (old.sort_order !== '' && !/^\d{1,3}$/.test(old.sort_order)) {
    errors.push('Display order must be a whole number from 0 to 999.');
  }
  return { old, errors };
}

function toRecord(old) {
  return {
    fullName: old.full_name,
    position: old.position,
    committeeId: old.committee_id === '' ? null : Number(old.committee_id),
    term: old.term,
    sortOrder: old.sort_order === '' ? 0 : Number(old.sort_order)
  };
}

async function renderForm(res, status, title, action, errors, old) {
  const committees = await committeeModel.listAll();
  res.status(status).render('manage/officers/form', { title, action, errors, old, committees });
}

router.get('/', async (req, res, next) => {
  try {
    const officers = await officerModel.listAll();
    res.render('manage/officers/index', { title: 'Manage officer directory', officers });
  } catch (err) {
    next(err);
  }
});

router.get('/new', async (req, res, next) => {
  try {
    await renderForm(res, 200, 'Add officer', '/manage/officers', [], { term: '2026-2027' });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { old, errors } = await validate(req.body);
    if (errors.length > 0) {
      return renderForm(res, 422, 'Add officer', '/manage/officers', errors, old);
    }
    await officerModel.create(toRecord(old));
    req.session.flash = { type: 'success', message: 'Officer added to the directory.' };
    res.redirect(303, '/manage/officers');
  } catch (err) {
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const officer = id ? await officerModel.findById(id) : null;
    if (!officer) return notFound(res);
    // Form fields are strings; turn the stored values into strings for the form
    const old = {
      ...officer,
      committee_id: officer.committee_id === null ? '' : String(officer.committee_id),
      sort_order: String(officer.sort_order)
    };
    await renderForm(res, 200, 'Edit officer', `/manage/officers/${id}`, [], old);
  } catch (err) {
    next(err);
  }
});

router.post('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { old, errors } = await validate(req.body);
    if (errors.length > 0) {
      return renderForm(res, 422, 'Edit officer', `/manage/officers/${id}`, errors, old);
    }
    const changed = await officerModel.update(id, toRecord(old));
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Officer updated.' };
    res.redirect(303, '/manage/officers');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/delete', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const changed = id ? await officerModel.remove(id) : 0;
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Officer removed from the directory.' };
    res.redirect(303, '/manage/officers');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
