// Counts for the dashboards. Read-only.
const pool = require('../db');

// The logged-in user's own items. Every count is filtered by user_id = ?,
// so a student only ever sees numbers about their own records.
async function getStudentSummary(userId) {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM concerns
         WHERE user_id = ? AND status IN ('submitted', 'under_review', 'responded')) AS open_concerns,
       (SELECT COUNT(*) FROM transactions
         WHERE user_id = ? AND status IN ('pending', 'under_review', 'approved')) AS active_requests,
       (SELECT COUNT(*) FROM event_registrations r
         JOIN events e ON e.id = r.event_id
         WHERE r.user_id = ? AND e.status = 'published' AND e.event_date >= CURDATE()) AS upcoming_events`,
    [userId, userId, userId]
  );
  return rows[0];
}

// Work waiting for officers, across all modules. The dashboard view shows
// each officer only the counts that match their role.
async function getOfficerCounts() {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE officer_request_status = 'pending') AS officer_requests_pending,
       (SELECT COUNT(*) FROM announcements WHERE status = 'draft') AS announcements_draft,
       (SELECT COUNT(*) FROM announcements WHERE status = 'pending') AS announcements_pending,
       (SELECT COUNT(*) FROM events WHERE status = 'draft') AS events_draft,
       (SELECT COUNT(*) FROM events WHERE status = 'pending') AS events_pending,
       (SELECT COUNT(*) FROM events WHERE status = 'published' AND event_date < CURDATE()) AS events_to_complete,
       (SELECT COUNT(*) FROM concerns WHERE status = 'submitted') AS concerns_submitted,
       (SELECT COUNT(*) FROM concerns WHERE status = 'under_review') AS concerns_under_review,
       (SELECT COUNT(*) FROM transactions WHERE status = 'pending') AS transactions_pending,
       (SELECT COUNT(*) FROM transactions WHERE status = 'under_review') AS transactions_under_review,
       (SELECT COUNT(*) FROM transactions WHERE status = 'approved') AS transactions_approved,
       (SELECT COUNT(*) FROM financial_reports WHERE status = 'draft') AS financial_draft,
       (SELECT COUNT(*) FROM financial_reports WHERE status = 'pending') AS financial_pending,
       (SELECT COUNT(*) FROM resolutions WHERE status = 'draft') AS resolutions_draft,
       (SELECT COUNT(*) FROM resolutions WHERE status = 'pending') AS resolutions_pending,
       (SELECT COUNT(*) FROM documents WHERE status = 'draft') AS documents_draft,
       (SELECT COUNT(*) FROM documents WHERE status = 'pending') AS documents_pending,
       (SELECT COUNT(*) FROM transactions t
        WHERE t.type = 'item_borrowing' AND t.status = 'approved'
          AND NOT EXISTS (SELECT 1 FROM item_loans l WHERE l.transaction_id = t.id)) AS loans_to_release,
       (SELECT COUNT(*) FROM item_loans WHERE returned_at IS NULL) AS loans_out,
       (SELECT COUNT(*) FROM item_loans WHERE returned_at IS NULL AND due_date < CURDATE()) AS loans_overdue`
  );
  return rows[0];
}

module.exports = { getStudentSummary, getOfficerCounts };
