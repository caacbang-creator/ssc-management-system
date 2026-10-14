// President: edit the About SSC text.
// Protected at the mount in app.js with requireRole('president').
const express = require('express');
const aboutModel = require('../models/aboutModel');

const router = express.Router();

const LIMITS = { overview: 5000, mission: 2000, vision: 2000 };

router.get('/', async (req, res, next) => {
  try {
    const about = await aboutModel.get();
    res.render('manage/about/edit', {
      title: 'Edit About SSC',
      errors: [],
      old: about || { overview: '', mission: '', vision: '' }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const old = {
      overview: String(req.body.overview ?? '').trim(),
      mission: String(req.body.mission ?? '').trim(),
      vision: String(req.body.vision ?? '').trim()
    };

    const errors = [];
    if (old.overview === '' || old.overview.length > LIMITS.overview) {
      errors.push(`Overview is required (up to ${LIMITS.overview} characters).`);
    }
    if (old.mission === '' || old.mission.length > LIMITS.mission) {
      errors.push(`Mission is required (up to ${LIMITS.mission} characters).`);
    }
    if (old.vision === '' || old.vision.length > LIMITS.vision) {
      errors.push(`Vision is required (up to ${LIMITS.vision} characters).`);
    }
    if (errors.length > 0) {
      return res.status(422).render('manage/about/edit', { title: 'Edit About SSC', errors, old });
    }

    await aboutModel.update(old, req.user.id);
    req.session.flash = { type: 'success', message: 'About SSC page updated.' };
    res.redirect(303, '/about');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
