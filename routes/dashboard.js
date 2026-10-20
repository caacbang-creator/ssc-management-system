// Dashboard and profile for logged-in users.
// Mounted in app.js with requireLogin.
const express = require('express');
const dashboardModel = require('../models/dashboardModel');
const announcementModel = require('../models/announcementModel');
const eventModel = require('../models/eventModel');
const eventPhotoModel = require('../models/eventPhotoModel');

const router = express.Router();

// What each officer role should act on: [label, count field, link].
// Every role sees only its own list; the links lead to pages that check the role again.
const OFFICER_TASKS = {
  pro: [
    ['Announcement drafts', 'announcements_draft', '/manage/announcements?status=draft'],
    ['Event drafts', 'events_draft', '/manage/events?status=draft'],
    ['Past events to mark completed', 'events_to_complete', '/manage/events?status=published'],
    ['New concerns to review', 'concerns_submitted', '/manage/concerns?status=submitted'],
    ['Concerns waiting for a response', 'concerns_under_review', '/manage/concerns?status=under_review'],
    ['New requests to review', 'transactions_pending', '/manage/transactions?status=pending'],
    ['Approved requests to complete', 'transactions_approved', '/manage/transactions?status=approved']
  ],
  vp_internal: [
    ['Announcements to approve', 'announcements_pending', '/manage/announcements?status=pending'],
    ['Events to approve', 'events_pending', '/manage/events?status=pending'],
    ['Requests to approve or reject', 'transactions_under_review', '/manage/transactions?status=under_review'],
    ['New concerns to review', 'concerns_submitted', '/manage/concerns?status=submitted'],
    ['Concerns waiting for a response', 'concerns_under_review', '/manage/concerns?status=under_review']
  ],
  treasurer: [
    ['Financial report drafts', 'financial_draft', '/manage/financial-reports?status=draft'],
    ['Reports waiting for the President', 'financial_pending', '/manage/financial-reports?status=pending']
  ],
  secretary: [
    ['Resolution drafts', 'resolutions_draft', '/manage/resolutions?status=draft'],
    ['Document drafts', 'documents_draft', '/manage/documents?status=draft'],
    ['Resolutions waiting for the President', 'resolutions_pending', '/manage/resolutions?status=pending'],
    ['Documents waiting for the President', 'documents_pending', '/manage/documents?status=pending']
  ],
  property_custodian: [
    ['Approved requests to hand over', 'loans_to_release', '/manage/items/loans'],
    ['Overdue returns', 'loans_overdue', '/manage/items/loans'],
    ['Items out on loan', 'loans_out', '/manage/items/loans']
  ],
  president: [
    ['Officer role requests', 'officer_requests_pending', '/manage/officer-requests'],
    ['Financial reports to publish', 'financial_pending', '/manage/financial-reports?status=pending'],
    ['Resolutions to publish', 'resolutions_pending', '/manage/resolutions?status=pending'],
    ['Documents to publish', 'documents_pending', '/manage/documents?status=pending'],
    ['Announcements to approve', 'announcements_pending', '/manage/announcements?status=pending'],
    ['Events to approve', 'events_pending', '/manage/events?status=pending'],
    ['Requests to approve or reject', 'transactions_under_review', '/manage/transactions?status=under_review'],
    ['New concerns to review', 'concerns_submitted', '/manage/concerns?status=submitted']
  ]
};

// Management pages each officer role can open (shortcut links on the dashboard)
const OFFICER_LINKS = {
  pro: [['Announcements', '/manage/announcements'], ['Events', '/manage/events'], ['Concerns', '/manage/concerns'],
    ['Requests', '/manage/transactions'], ['Officer directory', '/manage/officers']],
  vp_internal: [['Announcements', '/manage/announcements'], ['Events', '/manage/events'], ['Concerns', '/manage/concerns'],
    ['Requests', '/manage/transactions'], ['Financial reports', '/manage/financial-reports'], ['Resolutions', '/manage/resolutions']],
  treasurer: [['Financial reports', '/manage/financial-reports']],
  secretary: [['Resolutions', '/manage/resolutions'], ['Documents', '/manage/documents']],
  property_custodian: [['Borrowing desk', '/manage/items/loans'], ['Items', '/manage/items']],
  president: [['Office now', '/manage/duty/now'], ['Officer performance', '/manage/duty/performance'],
    ['Officer of the Day', '/manage/duty'], ['Officer requests', '/manage/officer-requests'], ['About SSC', '/manage/about'],
    ['Officer directory', '/manage/officers'], ['Announcements', '/manage/announcements'], ['Events', '/manage/events'],
    ['Concerns', '/manage/concerns'], ['Requests', '/manage/transactions'], ['Items', '/manage/items'],
    ['Financial reports', '/manage/financial-reports'], ['Resolutions', '/manage/resolutions'], ['Documents', '/manage/documents']]
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "Good morning" / "Good afternoon" / "Good evening" by the server's local time
function greeting(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// 'YYYY-MM-DD' in local time (toISOString would give the UTC date: yesterday before 8 AM here)
function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Whole days from today to 'YYYY-MM-DD' (0 = today). Both dates at midnight, so no time-of-day error.
function daysUntil(dateText) {
  const [y, m, d] = String(dateText).slice(0, 10).split('-').map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const summary = await dashboardModel.getStudentSummary(req.user.id);
    const announcements = (await announcementModel.listPublished()).slice(0, 4);
    const events = (await eventModel.listUpcoming()).filter((e) => e.status === 'published');
    const photos = await eventPhotoModel.listRecent(5);

    // The soonest event gets a spotlight card; is this user already registered?
    const nextEvent = events[0] || null;
    if (nextEvent) {
      nextEvent.days_left = daysUntil(nextEvent.event_date);
      nextEvent.registered = await eventModel.isRegistered(nextEvent.id, req.user.id);
    }

    // Hero background: the cover of the latest completed event that has photos
    const covers = (await eventModel.listCompleted()).filter((e) => e.cover_path);
    const heroPhoto = covers.length > 0 ? covers[0].cover_path : null;

    const now = new Date();

    // Officer section: only for officer roles, and only that role's tasks
    let tasks = [];
    const role = req.user.role;
    if (OFFICER_TASKS[role]) {
      const counts = await dashboardModel.getOfficerCounts();
      tasks = OFFICER_TASKS[role].map(([label, field, href]) => ({ label, count: counts[field], href }));
    }

    res.render('dashboard/index', {
      title: 'Dashboard',
      summary,
      announcements,
      nextEvent,
      photos,
      heroPhoto,
      hello: greeting(now),
      todayText: `${DAYS[now.getDay()]}, ${res.app.locals.formatDate(localDate(now))}`,
      tasks,
      officerLinks: OFFICER_LINKS[role] || []
    });
  } catch (err) {
    next(err);
  }
});

router.get('/profile', (req, res) => {
  // req.user comes from loadUser and never includes the password hash
  res.render('dashboard/profile', { title: 'My profile' });
});

module.exports = router;
