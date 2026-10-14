// All SQL for the resolutions table.
// Every status change has the CURRENT status in its WHERE clause.
const pool = require('../db');

// ---------- Public ----------
async function listPublished() {
  const [rows] = await pool.query(
    `SELECT id, resolution_no, title, date_adopted, published_at
     FROM resolutions
     WHERE status = 'published'
     ORDER BY date_adopted DESC`
  );
  return rows;
}

async function findPublishedById(id) {
  const [rows] = await pool.query(
    `SELECT id, resolution_no, title, body, date_adopted, published_at
     FROM resolutions
     WHERE id = ? AND status = 'published'`,
    [id]
  );
  return rows[0] || null;
}

// ---------- Officers ----------
async function listForManage(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT id, resolution_no, title, date_adopted, status, updated_at
     FROM resolutions
     ${where}
     ORDER BY updated_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT s.id, s.resolution_no, s.title, s.body, s.date_adopted, s.status, s.review_remarks,
            s.published_at, s.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS author_name,
            CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
     FROM resolutions s
     JOIN users u ON u.id = s.created_by
     LEFT JOIN users r ON r.id = s.reviewed_by
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Used for a clear "number already used" message; excludeId skips the record being edited
async function numberExists(resolutionNo, excludeId) {
  const [rows] = await pool.query(
    'SELECT id FROM resolutions WHERE resolution_no = ? AND id <> ?',
    [resolutionNo, excludeId || 0]
  );
  return rows.length > 0;
}

async function create(resolution, userId) {
  const [result] = await pool.query(
    `INSERT INTO resolutions (resolution_no, title, body, date_adopted, status, created_by)
     VALUES (?, ?, ?, ?, 'draft', ?)`,
    [resolution.resolutionNo, resolution.title, resolution.body, resolution.dateAdopted, userId]
  );
  return result.insertId;
}

async function updateDraft(id, resolution) {
  const [result] = await pool.query(
    `UPDATE resolutions SET resolution_no = ?, title = ?, body = ?, date_adopted = ?
     WHERE id = ? AND status = 'draft'`,
    [resolution.resolutionNo, resolution.title, resolution.body, resolution.dateAdopted, id]
  );
  return result.affectedRows;
}

async function deleteDraft(id) {
  const [result] = await pool.query(
    `DELETE FROM resolutions WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// draft -> pending
async function submit(id) {
  const [result] = await pool.query(
    `UPDATE resolutions SET status = 'pending' WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// pending -> published (President)
async function publish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE resolutions
     SET status = 'published', reviewed_by = ?, review_remarks = NULL, published_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// pending -> draft with remarks (President)
async function returnToDraft(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE resolutions SET status = 'draft', reviewed_by = ?, review_remarks = ?
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// published -> draft (President)
async function unpublish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE resolutions SET status = 'draft', reviewed_by = ?, published_at = NULL
     WHERE id = ? AND status = 'published'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

module.exports = {
  listPublished, findPublishedById, listForManage, findById, numberExists, create,
  updateDraft, deleteDraft, submit, publish, returnToDraft, unpublish
};
