// Student services (C11, C26): clearance appointment, SSC appointment and item borrowing.
// Each service has its OWN page and form:
//   /transactions/new/clearance and /new/ssc  -> a month calendar showing the Officer of the Day
//   /transactions/new/borrow?item=3           -> the item's photo and details, then the form
// Mounted in app.js with requireLogin: every page here needs a logged-in user.
const express = require('express');
const transactionModel = require('../models/transactionModel');
const itemModel = require('../models/itemModel');
const dutyScheduleModel = require('../models/dutyScheduleModel');

const router = express.Router();

// URL name -> transactions.type. The type comes from the URL the student opened, never from the form.
const SERVICES = {
  clearance: 'clearance_appointment',
  ssc: 'ssc_appointment',
  borrow: 'item_borrowing'
};

// Office hours for appointments (C26). There are no fixed slots (C11): any time in this range.
const OPENS = '08:00';
const CLOSES = '17:00';

// How far ahead the calendar goes (this month + 5 more)
const MONTHS_AHEAD = 5;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The last day the calendar shows: the end of the month MONTHS_AHEAD from now
function lastBookableDate() {
  const now = new Date();
  return ymd(new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD + 1, 0));
}

// Turns '12' into 12; anything else (e.g. 'abc', '-1', '1.5') into null
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

function notFound(res) {
  res.status(404).render('errors/404', { title: 'Page not found' });
}

// A Date as 'YYYY-MM-DD' in local time
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function today() {
  return ymd(new Date());
}

// A Date as 'HH:MM' in local time
function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// '14:05' -> '2:05 PM' (for error messages; views use app.locals.formatTime)
function formatClock(value) {
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// The earliest time that can still be booked TODAY: the next minute, but never before the office opens.
// Strings in 'HH:MM' form compare correctly ('09:05' < '14:00').
function earliestTodayTime() {
  const next = hhmm(new Date(Date.now() + 60 * 1000));
  return next > OPENS ? next : OPENS;
}

// True only for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30)
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// True for 'HH:MM' from 00:00 to 23:59
function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ---------- The appointment calendar ----------
// Builds one month, Monday first. Each day says whether an appointment can be booked:
// not in the past AND at least one officer is on duty that weekday.
// monthText: 'YYYY-MM' from the URL (anything else, or out of range, shows this month).
async function buildCalendar(monthText, selectedDate) {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD, 1);

  let first = thisMonth;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthText)) {
    const [y, m] = monthText.split('-').map(Number);
    const asked = new Date(y, m - 1, 1);
    if (asked >= thisMonth && asked <= lastMonth) first = asked;
  }
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const last = new Date(first.getFullYear(), first.getMonth(), daysInMonth);

  // Officers on duty, grouped by MySQL weekday (1 = Sunday ... 7 = Saturday)
  const onDuty = {};
  (await dutyScheduleModel.listForCalendar()).forEach((row) => {
    (onDuty[row.day_of_week] = onDuty[row.day_of_week] || []).push(row);
  });
  const booked = {};
  (await transactionModel.countAppointmentsByDate(ymd(first), ymd(last))).forEach((row) => {
    booked[row.day] = Number(row.booked);
  });

  const todayText = today();
  const cells = [];
  // Blank cells before the 1st so it lands under the right weekday (Monday = column 1)
  const lead = (first.getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    const text = ymd(date);
    const officers = onDuty[date.getDay() + 1] || [];
    const past = text < todayText;
    // Today closes for booking once no time before closing is left (e.g. it is already 5 PM)
    const ended = text === todayText && earliestTodayTime() > CLOSES;
    cells.push({
      date: text,
      day,
      past,
      ended,
      isToday: text === todayText,
      officers,
      booked: booked[text] || 0,
      open: !past && !ended && officers.length > 0,
      selected: text === selectedDate
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);

  // The usual week, Monday first, for the "Who is on duty" box
  const weekly = [2, 3, 4, 5, 6, 7, 1].map((dow) => ({ name: DAY_NAMES[dow - 1], officers: onDuty[dow] || [] }));

  return {
    weekly,
    label: `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`,
    month: monthKey(first),
    prev: prev >= thisMonth ? monthKey(prev) : null,
    next: next <= lastMonth ? monthKey(next) : null,
    weeks,
    selected: cells.find((c) => c && c.selected && c.open) || null
  };
}

// The calendar page for a clearance or SSC appointment.
// The month shown is the chosen date's month, so a refused form comes back on the same month.
async function renderAppointment(req, res, status, service, errors, old) {
  const month = old.preferred_date && isValidDate(old.preferred_date)
    ? old.preferred_date.slice(0, 7)
    : String(req.query.month ?? '');
  const calendar = await buildCalendar(month, old.preferred_date || '');
  const titles = { clearance: 'Book a clearance appointment', ssc: 'Book an SSC appointment' };
  // Booking for today: the time box starts at the next minute (the server checks it again)
  const sel = calendar.selected;
  const minTime = sel && sel.isToday ? earliestTodayTime() : OPENS;
  res.status(status).render('transactions/appointment', {
    title: titles[service], service, calendar, errors, old, opens: OPENS, closes: CLOSES, minTime
  });
}

// The borrowing page: the item's photo and details beside the form
function renderBorrow(res, status, item, errors, old) {
  res.status(status).render('transactions/borrow', {
    title: `Borrow: ${item.name}`, item, errors, old, minDate: today()
  });
}

// ---------- Validation ----------
// Checks the fields of ONE service. Returns { old, errors, record }.
async function validate(type, body) {
  const old = {
    purpose: String(body.purpose ?? '').trim(),
    preferred_date: String(body.preferred_date ?? '').trim(),
    preferred_time: String(body.preferred_time ?? '').trim(),
    item_id: String(body.item_id ?? '').trim(),
    quantity: String(body.quantity ?? '').trim(),
    return_date: String(body.return_date ?? '').trim()
  };
  const errors = [];

  if (old.purpose === '' || old.purpose.length > 500) {
    errors.push('Purpose is required (up to 500 characters).');
  }
  const dateOk = isValidDate(old.preferred_date);
  if (!dateOk) {
    errors.push(type === 'item_borrowing' ? 'Enter a valid pick-up date.' : 'Choose a day on the calendar.');
  } else if (old.preferred_date < today()) {
    errors.push('The date cannot be in the past.');
  }

  // Fields that do not belong to this service are saved as NULL
  const record = {
    type,
    purpose: old.purpose,
    preferredDate: old.preferred_date,
    preferredTime: null,
    itemId: null,
    quantity: null,
    returnDate: null
  };

  if (type === 'clearance_appointment' || type === 'ssc_appointment') {
    // The calendar only links open days, but a typed or old form could still send any date
    if (dateOk && old.preferred_date > lastBookableDate()) {
      errors.push(`Appointments can be booked up to ${MONTHS_AHEAD} months ahead. Choose a day on the calendar.`);
    } else if (dateOk && old.preferred_date >= today() && !(await dutyScheduleModel.hasDutyOn(old.preferred_date))) {
      errors.push('No officer is on duty that day. Choose a day marked "Open".');
    }
    if (!isValidTime(old.preferred_time)) {
      errors.push('Enter a preferred time.');
    } else if (old.preferred_time < OPENS || old.preferred_time > CLOSES) {
      errors.push('Choose a time from 8:00 AM to 5:00 PM, when the office is open.');
    } else if (dateOk && old.preferred_date === today() && old.preferred_time < earliestTodayTime()) {
      // Today: the time must still be ahead (the server's clock, not the browser's)
      const earliest = earliestTodayTime();
      errors.push(earliest > CLOSES
        ? 'The office is closed for today. Choose another day.'
        : `That time has already passed today. Choose ${formatClock(earliest)} or later, or another day.`);
    }
    record.preferredTime = old.preferred_time;
  }

  if (type === 'item_borrowing') {
    const itemId = parseId(old.item_id);
    const item = itemId ? await itemModel.findById(itemId) : null;
    if (!item) {
      errors.push('That item is no longer listed.');
    } else if (item.status !== 'available') {
      // The page hides the form, but an old or typed form could still send the id
      errors.push(`"${item.name}" is not available right now${item.status_note ? ` (${item.status_note})` : ''}.`);
    }
    const quantity = /^\d{1,4}$/.test(old.quantity) ? Number(old.quantity) : 0;
    if (quantity < 1) {
      errors.push('Quantity must be a whole number of at least 1.');
    } else if (item && quantity > item.quantity) {
      errors.push(`Only ${item.quantity} of "${item.name}" can be borrowed.`);
    }
    if (!isValidDate(old.return_date)) {
      errors.push('Enter a valid return date.');
    } else if (dateOk && old.return_date < old.preferred_date) {
      errors.push('The return date cannot be before the pick-up date.');
    }
    record.itemId = itemId;
    record.quantity = quantity;
    record.returnDate = old.return_date;
  }

  return { old, errors, record };
}

// ---------- Services: the three services and my requests ----------
router.get('/', async (req, res, next) => {
  try {
    const transactions = await transactionModel.listForUser(req.user.id);
    res.render('transactions/my', { title: 'Services', transactions });
  } catch (err) {
    next(err);
  }
});

// Old links (/transactions/new?type=...&item=...) lead to the matching service page
router.get('/new', (req, res) => {
  const itemId = parseId(req.query.item);
  if (req.query.type === 'clearance_appointment') return res.redirect('/transactions/new/clearance');
  if (req.query.type === 'ssc_appointment') return res.redirect('/transactions/new/ssc');
  if (req.query.type === 'item_borrowing') {
    return res.redirect(itemId ? `/transactions/new/borrow?item=${itemId}` : '/items');
  }
  res.redirect('/transactions');
});

// ---------- Item borrowing (before '/new/:service') ----------
// Step 1 is the catalog (/items); this page is step 2 for ONE item
router.get('/new/borrow', async (req, res, next) => {
  try {
    const itemId = parseId(req.query.item);
    const item = itemId ? await itemModel.findById(itemId) : null;
    if (!item) return res.redirect('/items');
    renderBorrow(res, 200, item, [], { item_id: String(item.id), quantity: '1' });
  } catch (err) {
    next(err);
  }
});

router.post('/new/borrow', async (req, res, next) => {
  try {
    const { old, errors, record } = await validate('item_borrowing', req.body);
    if (errors.length > 0) {
      const item = record.itemId ? await itemModel.findById(record.itemId) : null;
      if (!item) return notFound(res);
      return renderBorrow(res, 422, item, errors, old);
    }
    const id = await transactionModel.create(record, req.user.id);
    req.session.flash = {
      type: 'success',
      message: 'Request sent. Once it is approved, pick the item up from the Property Custodian at the SSC office.'
    };
    res.redirect(303, `/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- Appointments: /new/clearance and /new/ssc ----------
router.get('/new/:service', async (req, res, next) => {
  try {
    const service = req.params.service;
    if (service !== 'clearance' && service !== 'ssc') return notFound(res);
    // ?date=2026-10-22 is the day picked on the calendar (checked again on submit)
    const date = String(req.query.date ?? '');
    await renderAppointment(req, res, 200, service, [], { preferred_date: isValidDate(date) ? date : '' });
  } catch (err) {
    next(err);
  }
});

router.post('/new/:service', async (req, res, next) => {
  try {
    const service = req.params.service;
    if (service !== 'clearance' && service !== 'ssc') return notFound(res);
    const { old, errors, record } = await validate(SERVICES[service], req.body);
    if (errors.length > 0) return renderAppointment(req, res, 422, service, errors, old);
    const id = await transactionModel.create(record, req.user.id);
    req.session.flash = { type: 'success', message: 'Appointment requested. The SSC will review it.' };
    res.redirect(303, `/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

// ---------- One of my requests ----------
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const transaction = id ? await transactionModel.findOwn(id, req.user.id) : null;
    if (!transaction) return notFound(res);
    res.render('transactions/show', { title: `Request ${transaction.reference_no}`, transaction });
  } catch (err) {
    next(err);
  }
});

// ---------- Cancel (owner, while pending) ----------
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return notFound(res);
    const changed = await transactionModel.cancelOwn(id, req.user.id);
    if (changed === 0) {
      // Not yours (or missing) -> 404. Yours but no longer pending -> refused.
      const own = await transactionModel.findOwn(id, req.user.id);
      if (!own) return notFound(res);
      req.session.flash = { type: 'error', message: 'Only pending requests can be cancelled.' };
      return res.redirect(303, `/transactions/${id}`);
    }
    req.session.flash = { type: 'success', message: 'Request cancelled.' };
    res.redirect(303, `/transactions/${id}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
