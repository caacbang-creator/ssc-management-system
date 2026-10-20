// Load settings from .env into process.env before anything else reads them
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const { loadUser, requireLogin, requireRole } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const officerRequestRoutes = require('./routes/officerRequests');
const aboutRoutes = require('./routes/about');
const officerRoutes = require('./routes/officers');
const manageAboutRoutes = require('./routes/manageAbout');
const manageCommitteeRoutes = require('./routes/manageCommittees');
const manageOfficerRoutes = require('./routes/manageOfficers');
const announcementRoutes = require('./routes/announcements');
const manageAnnouncementRoutes = require('./routes/manageAnnouncements');
const eventRoutes = require('./routes/events');
const manageEventRoutes = require('./routes/manageEvents');
const concernRoutes = require('./routes/concerns');
const manageConcernRoutes = require('./routes/manageConcerns');
const transactionRoutes = require('./routes/transactions');
const itemRoutes = require('./routes/items');
const manageTransactionRoutes = require('./routes/manageTransactions');
const manageItemRoutes = require('./routes/manageItems');
const manageDutyRoutes = require('./routes/manageDuty');
const officeRoutes = require('./routes/office');
const documentRoutes = require('./routes/documents');
const manageFinancialReportRoutes = require('./routes/manageFinancialReports');
const manageResolutionRoutes = require('./routes/manageResolutions');
const manageDocumentRoutes = require('./routes/manageDocuments');
const dashboardRoutes = require('./routes/dashboard');
const announcementModel = require('./models/announcementModel');
const eventModel = require('./models/eventModel');

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is missing in .env. See .env.example.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// EJS view engine; pages live in /views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Used in views: '2026-10-01 14:30:00' -> 'October 1, 2026'.
// The text is split by hand so no time-zone shift can change the day.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
app.locals.formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
};

// Used for the calendar badge on event cards: '2026-10-01' -> { month: 'Oct', day: 1 }
app.locals.dateBadge = (value) => {
  const [, month, day] = String(value).slice(0, 10).split('-');
  return { month: MONTHS[Number(month) - 1].slice(0, 3), day: Number(day) };
};

// Role names shown to people (keys match the users.role ENUM)
app.locals.roleLabels = {
  student: 'Student',
  pro: 'Public Relations Officer',
  vp_internal: 'Vice President for Internal Affairs',
  treasurer: 'Treasurer',
  secretary: 'Secretary',
  property_custodian: 'Property Custodian',
  president: 'President'
};

// Used in views: '12350.5' -> '₱12,350.50' and '-500' -> '-₱500.00'
app.locals.formatMoney = (value) => {
  const amount = Number(value);
  const text = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (amount < 0 ? '-₱' : '₱') + text;
};

// The school year a date falls in, e.g. '2026-2027'. A school year runs June to May,
// so July 2026 -> '2026-2027' and March 2027 -> '2026-2027'.
app.locals.schoolYearOf = (date = new Date()) => {
  const start = date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
};

// The three request types (decision C11). The keys match the ENUM in schema.sql and
// are also the allow-list the routes check against.
app.locals.transactionTypes = {
  clearance_appointment: 'Clearance appointment',
  item_borrowing: 'Item borrowing',
  ssc_appointment: 'SSC appointment'
};

// Used in views: '13:30:00' -> '1:30 PM'
app.locals.formatTime = (value) => {
  if (!value) return '';
  const [hours, minutes] = String(value).split(':').map(Number);
  const suffix = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

// Request logger: prints method, URL, status code and time taken once the response is sent
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Read HTML form posts into req.body
app.use(express.urlencoded({ extended: false }));

// Serve CSS and images from /public
app.use(express.static(path.join(__dirname, 'public')));

// Sessions: the browser keeps only a signed cookie with a random id; the data stays on the server
app.use(session({
  name: 'ssc.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,           // JavaScript in the page cannot read the cookie
    sameSite: 'lax',          // not sent on form posts from other websites
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  }
}));

// Values every view can use: the current path and a one-time flash message
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use(loadUser);

// Officers get a left sidebar with their tools on My dashboard and the officer pages
// (nav.ejs opens the layout, foot.ejs closes it). Cosmetic only: the routers check roles.
app.use((req, res, next) => {
  const officerPage = req.path === '/dashboard' || req.path.startsWith('/manage/') || req.path.startsWith('/office/');
  res.locals.showSidebar = Boolean(req.user && req.user.role !== 'student' && officerPage);
  next();
});

// Routes
// Home shows the newest news and the next few events, so the most useful information is on the first page
app.get('/', async (req, res, next) => {
  try {
    const announcements = (await announcementModel.listPublished()).slice(0, 2);
    const events = (await eventModel.listUpcoming()).filter((e) => e.status === 'published').slice(0, 3);
    res.render('home', { title: 'Home', announcements, events });
  } catch (err) {
    next(err);
  }
});

app.use('/', authRoutes);

// Public pages (no login)
app.use('/about', aboutRoutes);
app.use('/officers', officerRoutes);
app.use('/announcements', announcementRoutes);
app.use('/events', eventRoutes);
app.use('/concerns', concernRoutes); // submit and "my concerns" need login; tracking is public
app.use('/documents', documentRoutes);

// Logged-in pages
app.use('/transactions', requireLogin, transactionRoutes);
app.use('/items', requireLogin, itemRoutes);
app.use('/office', requireLogin, officeRoutes);   // officers only (requireOfficer inside)
app.use(['/dashboard', '/profile'], requireLogin);
app.use('/', dashboardRoutes);

// Officer pages: the role check is attached here, so every route inside is protected
app.use('/manage/officer-requests', requireRole('president'), officerRequestRoutes);
app.use('/manage/about', requireRole('president'), manageAboutRoutes);
app.use('/manage/committees', requireRole('pro', 'president'), manageCommitteeRoutes);
app.use('/manage/officers', requireRole('pro', 'president'), manageOfficerRoutes);
app.use('/manage/announcements', requireRole('pro', 'vp_internal', 'president'), manageAnnouncementRoutes);
app.use('/manage/events', requireRole('pro', 'vp_internal', 'president'), manageEventRoutes);
app.use('/manage/concerns', requireRole('pro', 'vp_internal', 'president'), manageConcernRoutes);
app.use('/manage/transactions', requireRole('pro', 'vp_internal', 'president'), manageTransactionRoutes);
app.use('/manage/items', requireRole('property_custodian', 'president'), manageItemRoutes);
app.use('/manage/duty', requireRole('president'), manageDutyRoutes);
app.use('/manage/financial-reports', requireRole('treasurer', 'vp_internal', 'president'), manageFinancialReportRoutes);
app.use('/manage/resolutions', requireRole('secretary', 'vp_internal', 'president'), manageResolutionRoutes);
app.use('/manage/documents', requireRole('secretary', 'president'), manageDocumentRoutes);

// TEMPORARY: lets us test the 500 page. Remove before Round 1 submission.
app.get('/error-test', (req, res) => {
  throw new Error('Test error from /error-test');
});

// 404 handler: runs only when no route above matched
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Page not found' });
});

// Error handler: 4 parameters so Express knows it handles errors. Registered LAST.
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).render('errors/500', { title: 'Something went wrong' });
});

const server = app.listen(PORT, () => {
  console.log(`SSC system running at http://localhost:${PORT}`);
});

// Node stops a request after 5 minutes by default. A 250 MB video (C21) on slow Wi-Fi can
// take longer, so uploads get up to 30 minutes.
server.requestTimeout = 30 * 60 * 1000;
