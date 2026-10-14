// Public: published announcements (no login needed)
const express = require('express');
const announcementModel = require('../models/announcementModel');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const announcements = await announcementModel.listPublished();
    res.render('announcements/index', { title: 'Announcements', announcements });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = /^[1-9]\d*$/.test(req.params.id) ? Number(req.params.id) : null;
    // Drafts and pending announcements are "not found" to the public
    const announcement = id ? await announcementModel.findPublishedById(id) : null;
    if (!announcement) {
      return res.status(404).render('errors/404', { title: 'Page not found' });
    }
    res.render('announcements/show', { title: announcement.title, announcement });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
