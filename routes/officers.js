// Public: officer directory (no login needed)
const express = require('express');
const officerModel = require('../models/officerModel');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const officers = await officerModel.listAll();
    res.render('officers/index', { title: 'SSC officers', officers });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
