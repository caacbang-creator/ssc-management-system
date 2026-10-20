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
// extra: { codeErrors, customCode } after a refused custom code
async function renderSchedule(req, res, status, errors, old, extra = {}) {
  const week = await dutyScheduleModel.listWeek();
  const officers = await userModel.listOfficers();
  const office = await officeCodeModel.get();
  // The link the President can put in a QR code. Built from this request, so it matches the
  // address the site is reached at (e.g. http://192.168.1.10:3000 on the office Wi-Fi).
  const checkInLink = office
    ? `${req.protocol}://${req.get('host')}/office/check-in?code=${encodeURIComponent(office.code)}`
    : '';
  res.status(status).render('manage/duty/index', {
    title: 'Officer of the Day', week, officers, office, checkInLink,
    dayNames: DAY_NAMES, weekOrder: WEEK_ORDER, errors, old,
    codeErrors: extra.codeErrors || [], customCode: extra.customCode || ''
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

// The President's own code. Letters and digits only, 4 to 10: it is typed on phones and goes
// into the printed check-in link, where spaces or symbols would break the address.
router.post('/code/custom', async (req, res, next) => {
  const code = String(req.body.code ?? '').trim().toUpperCase();
  try {
    const errors = [];
    if (!/^[A-Z0-9]{4,10}$/.test(code)) {
      errors.push('The office code must be 4 to 10 letters or numbers (no spaces or symbols).');
    } else {
      const current = await officeCodeModel.get();
      if (current && current.code === code) errors.push('That is already the office code.');
    }
    if (errors.length > 0) {
      return renderSchedule(req, res, 422, [], { user_id: '', day_of_week: '', start_time: '08:00' }, { codeErrors: errors, customCode: code });
    }
    await officeCodeModel.setCustom(code, req.user.id);
    req.session.flash = {
      type: 'success',
      message: `Office code changed to ${code}. The old code no longer works, so print the new link or QR code.`
    };
    res.redirect(303, '/manage/duty');
  } catch (err) {
    next(err);
  }
});

// A random new code: the old printed code / QR link stops working at once
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

// ---------- Officer Performance ----------

// True only for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-13-40)
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// Date <-> 'YYYY-MM-DD' in local time (toISOString would use UTC and shift the day)
function toText(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function toDate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// How many days between from and to (inclusive), e.g. Oct 1 to Oct 3 = 3
function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000) + 1;
}

// How many duty days an officer had between two dates.
// A small loop: walk day by day and count the days whose weekday is on their schedule.
// days = the officer's weekdays in DAYOFWEEK() numbers (1 = Sunday ... 7 = Saturday);
// JavaScript's getDay() is 0 = Sunday, so getDay() + 1 gives the same number.
function countDutyDays(days, from, to) {
  let count = 0;
  for (let d = toDate(from); d <= toDate(to); d.setDate(d.getDate() + 1)) {
    if (days.includes(d.getDay() + 1)) count++;
  }
  return count;
}

// Any number -> a whole percent from 0 to 100, so a bad number can never break a bar's width
function pct(part, whole) {
  if (!whole) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

// 'YYYY-MM' for every month from one date to another, so months without duties still show a bar
function monthsBetween(from, to) {
  const months = [];
  const d = toDate(from);
  d.setDate(1);
  while (toText(d).slice(0, 7) <= to.slice(0, 7)) {
    months.push(toText(d).slice(0, 7));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The period dropdown on the Performance page: { key, label, from, to }
function periodChoices(schoolYear) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthName = (year, month) => `${MONTH_SHORT[month]} ${year}`;
  const firstOf = (year, month) => toText(new Date(year, month, 1));
  const lastOf = (year, month) => toText(new Date(year, month + 1, 0)); // day 0 = last day of the month before
  const start = Number(schoolYear.slice(0, 4));
  const threeAgo = new Date(y, m - 2, 1);
  const thirtyAgo = new Date(y, m, now.getDate() - 29);
  return [
    { key: 'year', label: `This school year (Jun ${start} – May ${start + 1})`, from: `${start}-06-01`, to: `${start + 1}-05-31` },
    { key: 'last3', label: `${MONTH_SHORT[threeAgo.getMonth()]} – ${monthName(y, m)}`, from: toText(threeAgo), to: lastOf(y, m) },
    { key: 'month', label: `This month (${monthName(y, m)})`, from: firstOf(y, m), to: lastOf(y, m) },
    { key: 'lastmonth', label: `Last month (${monthName(new Date(y, m - 1, 1).getFullYear(), (m + 11) % 12)})`, from: firstOf(y, m - 1), to: lastOf(y, m - 1) },
    { key: 'last30', label: 'Last 30 days', from: toText(thirtyAgo), to: toText(now) }
  ];
}

router.get('/performance', async (req, res, next) => {
  try {
    const officers = await userModel.listOfficers();
    const week = await dutyScheduleModel.listWeek();
    const today = toText(new Date());

    // Defaults: the first officer and the current school year (June to May)
    const schoolYear = req.app.locals.schoolYearOf();
    const startYear = Number(schoolYear.slice(0, 4));
    const defaults = { user: officers[0] ? officers[0].id : null, from: `${startYear}-06-01`, to: `${startYear + 1}-05-31` };
    const periods = periodChoices(schoolYear);

    // ---- Validate the query string; bad values give a 422 message, never a crash ----
    const errors = [];
    let userId = defaults.user;
    if (req.query.user !== undefined && req.query.user !== '') {
      const asked = parseId(String(req.query.user));
      if (asked && officers.some((o) => o.id === asked)) userId = asked;
      else errors.push('Choose an officer from the list.');
    }
    let from = defaults.from;
    let to = defaults.to;
    const qFrom = String(req.query.from ?? '').trim();
    const qTo = String(req.query.to ?? '').trim();
    // ?period= picks a preset; 'custom' (or from/to without a period) uses the two dates
    let period = String(req.query.period ?? '');
    if (period === '' && (qFrom !== '' || qTo !== '')) period = 'custom';
    if (period !== 'custom' && !periods.some((p) => p.key === period)) period = 'year';
    if (period !== 'custom') {
      const preset = periods.find((p) => p.key === period);
      from = preset.from;
      to = preset.to;
    } else {
      if (!isValidDate(qFrom) || !isValidDate(qTo)) {
        errors.push('Enter real dates for From and To.');
      } else if (qFrom > qTo) {
        errors.push('From must be on or before To.');
      } else if (daysBetween(qFrom, qTo) > 1100) {
        errors.push('Choose a period of 3 years or less.');
      } else {
        from = qFrom;
        to = qTo;
      }
    }
    if (errors.length > 0) {
      // Show the page with the defaults so the President still sees something useful
      userId = defaults.user;
      from = defaults.from;
      to = defaults.to;
      period = 'year';
    }

    if (!userId) {
      return res.status(errors.length ? 422 : 200).render('manage/duty/performance', {
        title: 'Officer performance', officers, periods, errors, noOfficers: true, filter: { user: '', from, to, period }
      });
    }

    // Duties are counted up to today (future days cannot be missed yet). Today only counts once
    // the officer has timed in, so an officer is not "missing" a duty they can still do.
    const end = to < today ? to : today;
    const hasRange = from <= end;
    const scheduleOf = (id) => week.filter((d) => d.user_id === id);
    const doneToday = hasRange && end === today
      ? new Map((await officeLogModel.dutiesDoneByUser(today, today)).map((r) => [r.user_id, Number(r.duties)]))
      : new Map();
    // Scheduled duty days for one officer in [from, end]. Each weekday on their schedule counts
    // only from the day it was added (you cannot miss a duty you were not given yet), and today
    // is left out until they time in.
    const scheduledFor = (id) => {
      if (!hasRange) return 0;
      let count = 0;
      for (const row of scheduleOf(id)) {
        const start = row.since > from ? row.since : from;
        if (start <= end) count += countDutyDays([row.day_of_week], start, end);
      }
      const dueToday = end === today && scheduleOf(id).some((d) => d.day_of_week === new Date().getDay() + 1 && d.since <= today);
      if (dueToday && !doneToday.get(id)) count--;
      return Math.max(0, count);
    };

    // ---- The selected officer ----
    const officer = officers.find((o) => o.id === userId);
    const mySchedule = scheduleOf(userId);
    const totals = hasRange ? await officeLogModel.totalsForUser(userId, from, end)
      : { duties_done: 0, late_count: 0, missing_timeouts: 0, visits: 0, duty_minutes: 0, visit_minutes: 0 };
    const scheduled = scheduledFor(userId);
    const done = Number(totals.duties_done);
    const stats = {
      scheduled,
      done,
      // "–" when nothing was scheduled: never divide by zero
      rate: scheduled > 0 ? `${pct(done, scheduled)}%` : '–',
      missed: Math.max(0, scheduled - done),
      late: Number(totals.late_count),
      missingTimeouts: Number(totals.missing_timeouts),
      visits: Number(totals.visits),
      dutyHours: (Number(totals.duty_minutes) / 60).toFixed(1),
      visitHours: (Number(totals.visit_minutes) / 60).toFixed(1),
      totalHours: ((Number(totals.duty_minutes) + Number(totals.visit_minutes)) / 60).toFixed(1)
    };
    // "Hours in the office" bar: the duty part and the visit part always add up to 100%
    const allMinutes = Number(totals.duty_minutes) + Number(totals.visit_minutes);
    stats.dutyPct = pct(Number(totals.duty_minutes), allMinutes);
    stats.visitPct = allMinutes > 0 ? 100 - stats.dutyPct : 0;

    // ---- Duties per month (vertical bars) ----
    const perMonth = hasRange ? await officeLogModel.dutiesPerMonth(userId, from, end) : [];
    const countByMonth = new Map(perMonth.map((r) => [r.month, Number(r.duties)]));
    const months = hasRange ? monthsBetween(from, end) : [];
    const maxMonth = Math.max(0, ...months.map((m) => countByMonth.get(m) || 0));
    const monthBars = months.map((m) => {
      const count = countByMonth.get(m) || 0;
      return { label: `${MONTH_SHORT[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`, count, height: pct(count, maxMonth) };
    });

    // ---- Attendance rate of every scheduled officer (horizontal bars) ----
    const doneAll = hasRange ? new Map((await officeLogModel.dutiesDoneByUser(from, end)).map((r) => [r.user_id, Number(r.duties)])) : new Map();
    const scheduledIds = [...new Set(week.map((d) => d.user_id))];
    const rateBars = officers
      .filter((o) => scheduledIds.includes(o.id))
      .map((o) => {
        const s = scheduledFor(o.id);
        const d = doneAll.get(o.id) || 0;
        const rate = pct(d, s);
        return { person: o, scheduled: s, rate, rateText: s > 0 ? `${rate}%` : '–', selected: o.id === userId, low: s > 0 && rate < 60 };
      });

    res.status(errors.length ? 422 : 200).render('manage/duty/performance', {
      title: `Performance: ${officer.first_name}`,
      officers, errors, noOfficers: false,
      periods,
      filter: { user: userId, from, to, period },
      officer,
      scheduleText: mySchedule.map((d) => `Every ${DAY_NAMES[d.day_of_week]}, ${req.app.locals.formatTime(d.start_time)}`),
      countedUntil: hasRange ? end : null,
      stats,
      monthBars,
      rateBars
    });
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
    const now = new Date();
    res.render('manage/duty/now', {
      title: 'Office now',
      // "Updated 9:15 AM": when this page was made (refresh the page for a newer view)
      updatedAt: req.app.locals.formatTime(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`),
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
