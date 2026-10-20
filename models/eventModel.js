// All SQL for the events and event_registrations tables.
// Every status change has the CURRENT status in its WHERE clause, so an illegal
// transition changes 0 rows.
const pool = require('../db');

// Counts registrations for each event row (used in several SELECTs)
const REGISTERED_COUNT =
  '(SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count';

// ---------- Public ----------
// Published or cancelled events that have not happened yet
async function listUpcoming() {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.event_date, e.start_time, e.end_time, e.capacity, e.status,
            ${REGISTERED_COUNT}
     FROM events e
     WHERE e.status IN ('published', 'cancelled') AND e.event_date >= CURDATE()
     ORDER BY e.event_date ASC, e.start_time ASC`
  );
  return rows;
}

// cover_path = the first photo (NULL when the event has none)
async function listCompleted() {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.event_date,
            (SELECT p.file_path FROM event_photos p
             WHERE p.event_id = e.id ORDER BY p.sort_order LIMIT 1) AS cover_path,
            (SELECT COUNT(*) FROM event_photos p WHERE p.event_id = e.id) AS photo_count
     FROM events e
     WHERE e.status = 'completed'
     ORDER BY e.event_date DESC`
  );
  return rows;
}

// Drafts and pending events are never shown to the public
async function findPublicById(id) {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.description, e.venue, e.event_date, e.start_time, e.end_time,
            e.capacity, e.documentation, e.status, ${REGISTERED_COUNT}
     FROM events e
     WHERE e.id = ? AND e.status IN ('published', 'completed', 'cancelled')`,
    [id]
  );
  return rows[0] || null;
}

// ---------- Registration ----------
async function isRegistered(eventId, userId) {
  const [rows] = await pool.query(
    'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?',
    [eventId, userId]
  );
  return rows.length > 0;
}

// Registers a user inside a transaction. Returns 'ok', 'closed', 'full' or 'duplicate'.
// SELECT ... FOR UPDATE locks the event row, so two students clicking at the same
// moment are handled one after the other and the capacity can never be exceeded.
async function register(eventId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [events] = await conn.query(
      `SELECT id, capacity FROM events
       WHERE id = ? AND status = 'published' AND event_date >= CURDATE()
       FOR UPDATE`,
      [eventId]
    );
    if (events.length === 0) {
      await conn.rollback();
      return 'closed';
    }

    const [counts] = await conn.query(
      'SELECT COUNT(*) AS total FROM event_registrations WHERE event_id = ?',
      [eventId]
    );
    // capacity NULL = no limit (C22)
    if (events[0].capacity !== null && counts[0].total >= events[0].capacity) {
      await conn.rollback();
      return 'full';
    }

    await conn.query(
      'INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)',
      [eventId, userId]
    );
    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    // UNIQUE(event_id, user_id) is the final guard against double registration
    if (err.code === 'ER_DUP_ENTRY') return 'duplicate';
    throw err;
  } finally {
    conn.release();
  }
}

async function listRegistrationsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.venue, e.event_date, e.start_time, e.status, r.registered_at
     FROM event_registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.user_id = ?
     ORDER BY e.event_date DESC`,
    [userId]
  );
  return rows;
}

// ---------- Officers ----------
async function listForManage(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE e.status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.event_date, e.status, e.capacity, ${REGISTERED_COUNT}
     FROM events e
     ${where}
     ORDER BY e.event_date DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT e.id, e.title, e.description, e.venue, e.event_date, e.start_time, e.end_time,
            e.capacity, e.documentation, e.status, e.review_remarks, e.published_at,
            e.created_at, e.updated_at, ${REGISTERED_COUNT},
            CONCAT(u.first_name, ' ', u.last_name) AS author_name,
            CONCAT(rv.first_name, ' ', rv.last_name) AS reviewer_name
     FROM events e
     JOIN users u ON u.id = e.created_by
     LEFT JOIN users rv ON rv.id = e.reviewed_by
     WHERE e.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function create(event, userId) {
  const [result] = await pool.query(
    `INSERT INTO events (title, description, venue, event_date, start_time, end_time, capacity,
       status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [event.title, event.description, event.venue, event.eventDate, event.startTime,
      event.endTime, event.capacity, userId]
  );
  return result.insertId;
}

async function updateDraft(id, event) {
  const [result] = await pool.query(
    `UPDATE events
     SET title = ?, description = ?, venue = ?, event_date = ?, start_time = ?, end_time = ?, capacity = ?
     WHERE id = ? AND status = 'draft'`,
    [event.title, event.description, event.venue, event.eventDate, event.startTime,
      event.endTime, event.capacity, id]
  );
  return result.affectedRows;
}

// Editing a published event sends it back for approval (C14): the new details and the
// status change happen in ONE query, so a live event can never show unapproved text.
async function updatePublished(id, event) {
  const [result] = await pool.query(
    `UPDATE events
     SET title = ?, description = ?, venue = ?, event_date = ?, start_time = ?, end_time = ?, capacity = ?,
         status = 'pending', review_remarks = NULL
     WHERE id = ? AND status = 'published'`,
    [event.title, event.description, event.venue, event.eventDate, event.startTime,
      event.endTime, event.capacity, id]
  );
  return result.affectedRows;
}

async function deleteDraft(id) {
  const [result] = await pool.query(
    `DELETE FROM events WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// President only (C23): permanently deletes an event that is public (published, completed or
// cancelled). Registrations, photos and videos rows go with it (ON DELETE CASCADE).
async function deletePublic(id) {
  const [result] = await pool.query(
    `DELETE FROM events WHERE id = ? AND status IN ('published', 'completed', 'cancelled')`,
    [id]
  );
  return result.affectedRows;
}

// draft -> pending
async function submit(id) {
  const [result] = await pool.query(
    `UPDATE events SET status = 'pending' WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// pending -> published (only if the event has not already passed)
async function approve(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE events
     SET status = 'published', reviewed_by = ?, review_remarks = NULL, published_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// pending -> draft, with remarks
async function returnToDraft(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE events SET status = 'draft', reviewed_by = ?, review_remarks = ?
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// published -> cancelled
async function cancel(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE events SET status = 'cancelled', reviewed_by = ?
     WHERE id = ? AND status = 'published'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// published -> completed (only on or after the event date)
async function complete(id) {
  const [result] = await pool.query(
    `UPDATE events SET status = 'completed'
     WHERE id = ? AND status = 'published' AND event_date <= CURDATE()`,
    [id]
  );
  return result.affectedRows;
}

// Documentation is only for completed events
async function saveDocumentation(id, documentation) {
  const [result] = await pool.query(
    `UPDATE events SET documentation = ? WHERE id = ? AND status = 'completed'`,
    [documentation, id]
  );
  return result.affectedRows;
}

async function listRegistrants(eventId) {
  const [rows] = await pool.query(
    `SELECT u.student_no, u.first_name, u.last_name, u.email, r.registered_at
     FROM event_registrations r
     JOIN users u ON u.id = r.user_id
     WHERE r.event_id = ?
     ORDER BY r.registered_at ASC`,
    [eventId]
  );
  return rows;
}

module.exports = {
  listUpcoming,
  listCompleted,
  findPublicById,
  isRegistered,
  register,
  listRegistrationsForUser,
  listForManage,
  findById,
  create,
  updateDraft,
  updatePublished,
  deleteDraft,
  deletePublic,
  submit,
  approve,
  returnToDraft,
  cancel,
  complete,
  saveDocumentation,
  listRegistrants
};
