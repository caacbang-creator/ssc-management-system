// All SQL for the documents table (other SSC documents: minutes, memoranda, letters).
// Every status change has the CURRENT status in its WHERE clause.
const pool = require('../db');

// ---------- Public ----------
async function listPublished() {
  const [rows] = await pool.query(
    `SELECT id, title, doc_type, published_at
     FROM documents
     WHERE status = 'published'
     ORDER BY published_at DESC`
  );
  return rows;
}

async function findPublishedById(id) {
  const [rows] = await pool.query(
    `SELECT id, title, doc_type, body, published_at
     FROM documents
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
    `SELECT id, title, doc_type, status, updated_at
     FROM documents
     ${where}
     ORDER BY updated_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT d.id, d.title, d.doc_type, d.body, d.status, d.review_remarks, d.published_at, d.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS author_name,
            CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
     FROM documents d
     JOIN users u ON u.id = d.created_by
     LEFT JOIN users r ON r.id = d.reviewed_by
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function create(doc, userId) {
  const [result] = await pool.query(
    `INSERT INTO documents (title, doc_type, body, status, created_by)
     VALUES (?, ?, ?, 'draft', ?)`,
    [doc.title, doc.docType, doc.body, userId]
  );
  return result.insertId;
}

async function updateDraft(id, doc) {
  const [result] = await pool.query(
    `UPDATE documents SET title = ?, doc_type = ?, body = ?
     WHERE id = ? AND status = 'draft'`,
    [doc.title, doc.docType, doc.body, id]
  );
  return result.affectedRows;
}

async function deleteDraft(id) {
  const [result] = await pool.query(
    `DELETE FROM documents WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// draft -> pending
async function submit(id) {
  const [result] = await pool.query(
    `UPDATE documents SET status = 'pending' WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// pending -> published (President)
async function publish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE documents
     SET status = 'published', reviewed_by = ?, review_remarks = NULL, published_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// pending -> draft with remarks (President)
async function returnToDraft(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE documents SET status = 'draft', reviewed_by = ?, review_remarks = ?
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// published -> draft (President)
async function unpublish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE documents SET status = 'draft', reviewed_by = ?, published_at = NULL
     WHERE id = ? AND status = 'published'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

module.exports = {
  listPublished, findPublishedById, listForManage, findById, create,
  updateDraft, deleteDraft, submit, publish, returnToDraft, unpublish
};
