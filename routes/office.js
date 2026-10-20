// Office check-in / check-out for officers (decision C25).
// Mounted in app.js as app.use('/office', requireLogin, officeRoutes); students get 403 here.
// Rules:
//   - the officer is ALWAYS req.user.id, never an id or name from the form
//   - every time comes from the database clock (see officeLogModel), never from the form
//   - recording attendance is always a POST; GET only shows the form, because link previewers
//     and scanners can open GET links without anyone clicking
//   - duty or visit is decided HERE from the schedule, never taken from the form
const express = require('express');
const bcrypt = require('bcrypt');
const { requireOfficer } = require('../middleware/auth');
const userModel = require('../models/userModel');
const dutyScheduleModel = require('../models/dutyScheduleModel');
const officeCodeModel = require('../models/officeCodeModel');
const officeLogModel = require('../models/officeLogModel');

const router = express.Router();
router.use(requireOfficer);

const CODE_PATTERN = /^[A-Z0-9]{6}$/;

// '2026-10-20 08:02:00' -> '8:02 AM' (formatTime expects 'HH:MM:SS')
function clockOf(app, dateTime) {
  return app.locals.formatTime(String(dateTime).slice(11, 19));
}

// Everything the check-in page needs to know about the logged-in officer today
async function loadToday(userId) {
  const me = await userModel.findOfficerById(userId);
  const duty = await dutyScheduleModel.isScheduledToday(userId);
  const openLog = await officeLogModel.findOpenLog(userId);
  const dutyDone = await officeLogModel.hasDutyToday(userId);
  // Scheduled today and no duty logged yet -> this Time In is a duty; otherwise a visit
  const nextIsDuty = Boolean(duty) && !dutyDone;
  return { me, duty, openLog, nextIsDuty };
}

async function renderCheckIn(req, res, status, errors, code) {
  const today = await loadToday(req.user.id);
  res.status(status).render('office/check-in', {
    title: 'Office check-in', ...today, errors, code,
    sinceText: today.openLog ? clockOf(req.app, today.openLog.time_in) : ''
  });
}

// The typed or scanned code, cleaned: trimmed and in capitals (the code has no small letters)
function cleanCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

// ---------- The form (GET only shows it; nothing is recorded) ----------
router.get('/check-in', async (req, res, next) => {
  try {
    // ?code=XXXXXX from the printed QR link fills the field, but only if it looks like a code
    const fromLink = cleanCode(req.query.code);
    await renderCheckIn(req, res, 200, [], CODE_PATTERN.test(fromLink) ? fromLink : '');
  } catch (err) {
    next(err);
  }
});

// ---------- Time In ----------
router.post('/check-in', async (req, res, next) => {
  const code = cleanCode(req.body.code);
  // The password is never logged, never sent back to the page and never stored
  const password = String(req.body.password ?? '');
  try {
    // 1. The office code (only visible at the SSC office)
    const office = await officeCodeModel.get();
    if (code === '' || !office || code !== office.code) {
      return renderCheckIn(req, res, 422, ['That office code is not right. Use the code shown at the SSC office.'], code);
    }
    // 2. The officer's own password, so a borrowed phone or open session is not enough
    const hash = password === '' ? null : await userModel.findPasswordHash(req.user.id);
    const passwordOk = hash ? await bcrypt.compare(password, hash) : false;
    if (!passwordOk) {
      return renderCheckIn(req, res, 422, ['Your password is not right. Type the password you log in with.'], code);
    }
    // 3. Not already in the office
    const today = await loadToday(req.user.id);
    if (today.openLog) {
      return renderCheckIn(req, res, 422,
        [`You are already checked in since ${clockOf(req.app, today.openLog.time_in)}.`], code);
    }
    // 4. Duty or visit, decided on the server from the schedule (never from the form).
    //    A second Time In on a duty day (after timing out) is a visit, not a second duty.
    const logType = today.nextIsDuty ? 'duty' : 'visit';
    const log = await officeLogModel.timeIn(req.user.id, logType, today.nextIsDuty ? today.duty.start_time : null);
    if (!log) {
      // Another request checked in a moment ago (e.g. a double click)
      return renderCheckIn(req, res, 422, ['You are already checked in.'], code);
    }
    const time = clockOf(req.app, log.time_in);
    req.session.flash = {
      type: 'success',
      message: logType === 'duty'
        ? `Timed in at ${time}${log.is_late ? ' (late: more than 15 minutes after your start time)' : ''}.`
        : `Checked in as visitor at ${time}.`
    };
    res.redirect(303, '/office/check-in');
  } catch (err) {
    next(err);
  }
});

// ---------- Time Out ----------
router.post('/check-out', async (req, res, next) => {
  const code = cleanCode(req.body.code);
  try {
    const office = await officeCodeModel.get();
    if (code === '' || !office || code !== office.code) {
      return renderCheckIn(req, res, 422, ['That office code is not right. Use the code shown at the SSC office.'], code);
    }
    const closed = await officeLogModel.timeOut(req.user.id);
    if (closed === 0) {
      return renderCheckIn(req, res, 422, ['You are not checked in.'], code);
    }
    req.session.flash = { type: 'success', message: 'Timed out. Thank you for your time at the office!' };
    res.redirect(303, '/office/check-in');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
