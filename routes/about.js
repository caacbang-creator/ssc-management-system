// Public: About SSC page (no login needed)
const express = require('express');
const aboutModel = require('../models/aboutModel');
const committeeModel = require('../models/committeeModel');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const about = await aboutModel.get();
    const committees = await committeeModel.listAll();
    res.render('about/index', { title: 'About the SSC', about, committees });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
