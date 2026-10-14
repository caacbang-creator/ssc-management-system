// PRO and President: manage committees.
// Protected at the mount in app.js with requireRole('pro', 'president').
const express = require('express');
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
async function validate(body, excludeId) {
  const old = {
    name: String(body.name ?? '').trim(),
    description: String(body.description ?? '').trim()
  };
  const errors = [];
  if (old.name === '' || old.name.length > 100) {
    errors.push('Committee name is required (up to 100 characters).');
  } else if (await committeeModel.nameExists(old.name, excludeId)) {
    errors.push('A committee with that name already exists.');
  }
  if (old.description.length > 500) {
    errors.push('Description must be 500 characters or fewer.');
  }
  return { old, errors };
}

function toRecord(old) {
  return { name: old.name, description: old.description || null };
}

router.get('/', async (req, res, next) => {
  try {
    const committees = await committeeModel.listAll();
    res.render('manage/committees/index', { title: 'Manage committees', committees });
  } catch (err) {
    next(err);
  }
});

router.get('/new', (req, res) => {
  res.render('manage/committees/form', {
    title: 'Add committee', action: '/manage/committees', errors: [], old: {}
  });
});

router.post('/', async (req, res, next) => {
  try {
    const { old, errors } = await validate(req.body, null);
    if (errors.length > 0) {
      return res.status(422).render('manage/committees/form', {
        title: 'Add committee', action: '/manage/committees', errors, old
      });
    }
    await committeeModel.create(toRecord(old));
    req.session.flash = { type: 'success', message: 'Committee added.' };
    res.redirect(303, '/manage/committees');
  } catch (err) {
    // UNIQUE(name) is the final check if two people add the same name at once
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(422).render('manage/committees/form', {
        title: 'Add committee', action: '/manage/committees',
        errors: ['A committee with that name already exists.'], old: req.body
      });
    }
    next(err);
  }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const committee = id ? await committeeModel.findById(id) : null;
    if (!committee) return notFound(res);
    res.render('manage/committees/form', {
      title: 'Edit committee', action: `/manage/committees/${id}`, errors: [], old: committee
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const { old, errors } = await validate(req.body, id);
    if (errors.length > 0) {
      return res.status(422).render('manage/committees/form', {
        title: 'Edit committee', action: `/manage/committees/${id}`, errors, old
      });
    }
    const changed = await committeeModel.update(id, toRecord(old));
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Committee updated.' };
    res.redirect(303, '/manage/committees');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(422).render('manage/committees/form', {
        title: 'Edit committee', action: `/manage/committees/${req.params.id}`,
        errors: ['A committee with that name already exists.'], old: req.body
      });
    }
    next(err);
  }
});

router.post('/:id/delete', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const changed = id ? await committeeModel.remove(id) : 0;
    if (changed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Committee deleted. Its officers stay in the directory.' };
    res.redirect(303, '/manage/committees');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
