// President only: the weekly Officer of the Day (OOTD) schedule, the office code,
// Office Now and Officer Performance (decision C25).
// Mounted in app.js with requireRole('president'), so every route below is President-only.
const express = require('express');
const dutyScheduleModel = require('../models/dutyScheduleModel');
const officeCodeModel = require('../models/officeCodeModel');
const userModel = require('../models/userModel');
const officeLogModel = require('../models/officeLogModel');

const router = express.Router();

// DAYOFWEEK() numbering: 1 = Sunday ... 7 = Saturday. Index 0 is unused.
const DAY_NAMES = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [2, 3, 4, 5, 6, 7, 1]; // the form lists Monday first

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// True for 'HH:MM' from 00:00 to 23:59
function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ---------- Duty schedule + office code ----------
async function renderSchedule(req, res, status, errors, old) {
  const week = await dutyScheduleModel.listWeek();
  const officers = await userModel.listOfficers();
  const office = await officeCodeModel.get();
  // The link the President can put in a QR code. Built from this request, so it matches the
  // address the site is reached at (e.g. http://192.168.1.10:3000 on the office Wi-Fi).
  const checkInLink = office ? `${req.protocol}://${req.get('host')}/office/check-in?code=${office.code}` : '';
  res.status(status).render('manage/duty/index', {
    title: 'Officer of the Day', week, officers, office, checkInLink,
    dayNames: DAY_NAMES, weekOrder: WEEK_ORDER, errors, old
  });
}

router.get('/', async (req, res, next) => {
  try {
    await renderSchedule(req, res, 200, [], { user_id: '', day_of_week: '', start_time: '08:00' });
  } catch (err) {
    next(err);
  }
});

router.post('/schedule', async (req, res, next) => {
  const old = {
    user_id: String(req.body.user_id ?? '').trim(),
    day_of_week: String(req.body.day_of_week ?? '').trim(),
    start_time: String(req.body.start_time ?? '').trim()
  };
  try {
    const errors = [];
    const userId = parseId(old.user_id);
    // Only officers (not students) can be scheduled
    const officer = userId ? await userModel.findOfficerById(userId) : null;
    if (!officer) errors.push('Choose an officer from the list.');
    const day = /^[1-7]$/.test(old.day_of_week) ? Number(old.day_of_week) : null;
    if (!day) errors.push('Choose a day of the week.');
    if (!isValidTime(old.start_time)) errors.push('Enter a start time like 08:00.');
    if (errors.length === 0 && await dutyScheduleModel.exists(userId, day)) {
      errors.push(`${officer.first_name} is already on duty every ${DAY_NAMES[day]}.`);
    }
    if (errors.length > 0) return renderSchedule(req, res, 422, errors, old);

    await dutyScheduleModel.create(userId, day, old.start_time);
    req.session.flash = { type: 'success', message: `${officer.first_name} is now on duty every ${DAY_NAMES[day]}.` };
    res.redirect(303, '/manage/duty');
  } catch (err) {
    // UNIQUE(user_id, day_of_week) is the backup if two requests arrive at once
    if (err.code === 'ER_DUP_ENTRY') {
      return renderSchedule(req, res, 422, ['That officer is already on duty on that day.'], old);
    }
    next(err);
  }
});

router.post('/schedule/:id/delete', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const removed = id ? await dutyScheduleModel.remove(id) : 0;
    if (removed === 0) return notFound(res);
    req.session.flash = { type: 'success', message: 'Removed from the duty schedule.' };
    res.redirect(303, '/manage/duty');
  } catch (err) {
    next(err);
  }
});

// A new code: the old printed code / QR link stops working at once
router.post('/code', async (req, res, next) => {
  try {
    const code = await officeCodeModel.regenerate(req.user.id);
    req.session.flash = {
      type: 'success',
      message: `New office code: ${code}. The old code no longer works, so print the new link or QR code.`
    };
    res.redirect(303, '/manage/duty');
  } catch (err) {
    next(err);
  }
});

// ---------- Office Now ----------
// 75 -> '1 h 15 min', 40 -> '40 min'. The minutes come from TIMESTAMPDIFF in SQL.
function duration(minutes) {
  const m = Math.max(0, Number(minutes) || 0);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`;
}

router.get('/now', async (req, res, next) => {
  try {
    const present = await officeLogModel.listPresentNow();
    const left = await officeLogModel.listLeftToday();
    const notIn = await dutyScheduleModel.listScheduledNotInToday();
    res.render('manage/duty/now', {
      title: 'Office now',
      present,
      left,
      notIn,
      counts: {
        present: present.length,
        duty: present.filter((p) => p.log_type === 'duty').length,
        visit: present.filter((p) => p.log_type === 'visit').length,
        notIn: notIn.length
      },
      duration,
      // '2026-10-20 08:02:00' -> '8:02 AM'
      clock: (dateTime) => req.app.locals.formatTime(String(dateTime).slice(11, 19))
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
