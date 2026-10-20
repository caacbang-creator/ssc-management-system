// Public: About SSC page (no login needed)
const express = require('express');
const aboutModel = require('../models/aboutModel');
const officerModel = require('../models/officerModel');
const eventPhotoModel = require('../models/eventPhotoModel');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const about = await aboutModel.get();
    const officers = await officerModel.listAll();
    // Recent event photos: one for the header background, the rest for the "Life at the SSC" strip
    const photos = await eventPhotoModel.listRecent(6);
    res.render('about/index', { title: 'About the SSC', about, officers, photos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
