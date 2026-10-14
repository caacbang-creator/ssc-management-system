// Items students can borrow (login required, see app.js)
const express = require('express');
const itemModel = require('../models/itemModel');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const items = await itemModel.listAll();
    res.render('items/index', { title: 'Items you can borrow', items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
