// All SQL for the announcements table.
// Every status change has the CURRENT status in its WHERE clause, so an illegal
// transition (e.g. approving a draft, or approving twice) changes 0 rows.
const pool = require('../db');

// ---------- Public (published only) ----------
async function listPublished() {
  const [rows] = await pool.query(
    `SELECT id, title, category, body, published_at
     FROM announcements
     WHERE status = 'published'
     ORDER BY published_at DESC`
  );
  return rows;
}

async function findPublishedById(id) {
  const [rows] = await pool.query(
    `SELECT id, title, category, body, published_at
     FROM announcements
     WHERE id = ? AND status = 'published'`,
    [id]
  );
  return rows[0] || null;
}

// ---------- Officers ----------
// status is optional; when given it has already been checked against an allow-list
async function listForManage(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE a.status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.category, a.status, a.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS author_name
     FROM announcements a
     JOIN users u ON u.id = a.created_by
     ${where}
     ORDER BY a.updated_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.category, a.body, a.status, a.review_remarks,
            a.published_at, a.created_at, a.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS author_name,
            CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
     FROM announcements a
     JOIN users u ON u.id = a.created_by
     LEFT JOIN users r ON r.id = a.reviewed_by
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function create(announcement, userId) {
  const [result] = await pool.query(
    `INSERT INTO announcements (title, category, body, status, created_by)
     VALUES (?, ?, ?, 'draft', ?)`,
    [announcement.title, announcement.category, announcement.body, userId]
  );
  return result.insertId;
}

// Only drafts can be edited
async function updateDraft(id, announcement) {
  const [result] = await pool.query(
    `UPDATE announcements SET title = ?, category = ?, body = ?
     WHERE id = ? AND status = 'draft'`,
    [announcement.title, announcement.category, announcement.body, id]
  );
  return result.affectedRows;
}

// Only drafts can be deleted
async function deleteDraft(id) {
  const [result] = await pool.query(
    `DELETE FROM announcements WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// draft -> pending
async function submit(id) {
  const [result] = await pool.query(
    `UPDATE announcements SET status = 'pending'
     WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// pending -> published
async function approve(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE announcements
     SET status = 'published', reviewed_by = ?, review_remarks = NULL, published_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// pending -> draft, with the reviewer's remarks
async function returnToDraft(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE announcements
     SET status = 'draft', reviewed_by = ?, review_remarks = ?
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// published -> draft (published content is unpublished, never deleted)
async function unpublish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE announcements
     SET status = 'draft', reviewed_by = ?, published_at = NULL
     WHERE id = ? AND status = 'published'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

module.exports = {
  listPublished,
  findPublishedById,
  listForManage,
  findById,
  create,
  updateDraft,
  deleteDraft,
  submit,
  approve,
  returnToDraft,
  unpublish
};
