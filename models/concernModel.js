// All SQL for the concerns table.
// Anonymous concerns have user_id = NULL: they are linked to nobody and
// can only be followed with their reference number.
const pool = require('../db');

// Inserts the concern and gives it a reference number like C-2026-0007.
// Both steps run in one transaction, so a concern never exists without its number.
async function create(concern, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO concerns (user_id, category, subject, message)
       VALUES (?, ?, ?, ?)`,
      [userId, concern.category, concern.subject, concern.message]
    );
    await conn.query(
      `UPDATE concerns
       SET reference_no = CONCAT('C-', YEAR(created_at), '-', LPAD(id, 4, '0'))
       WHERE id = ?`,
      [result.insertId]
    );
    const [rows] = await conn.query(
      'SELECT reference_no FROM concerns WHERE id = ?',
      [result.insertId]
    );
    await conn.commit();
    return rows[0].reference_no;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------- Owner (named concerns only) ----------
async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, reference_no, category, subject, status, created_at,
            response IS NOT NULL AS has_reply
     FROM concerns
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

// Ownership is checked INSIDE the query: another user's concern is simply "not found"
async function findOwn(id, userId) {
  const [rows] = await pool.query(
    `SELECT id, reference_no, category, subject, message, status, response, responded_at, created_at
     FROM concerns
     WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return rows[0] || null;
}

// ---------- Public tracking: status and response ONLY ----------
async function findForTracking(referenceNo) {
  const [rows] = await pool.query(
    `SELECT reference_no, status, response, responded_at
     FROM concerns
     WHERE reference_no = ?`,
    [referenceNo]
  );
  return rows[0] || null;
}

// ---------- Officers ----------
async function listForManage(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE c.status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT c.id, c.reference_no, c.category, c.subject, c.status, c.created_at,
            c.user_id IS NULL AS is_anonymous
     FROM concerns c
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT c.id, c.reference_no, c.category, c.subject, c.message, c.status, c.response,
            c.responded_at, c.created_at, c.updated_at,
            c.user_id IS NULL AS is_anonymous,
            CONCAT(u.first_name, ' ', u.last_name) AS submitter_name,
            u.student_no AS submitter_student_no,
            u.email AS submitter_email,
            CONCAT(r.first_name, ' ', r.last_name) AS responder_name
     FROM concerns c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN users r ON r.id = c.responded_by
     WHERE c.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// submitted -> under_review
async function startReview(id) {
  const [result] = await pool.query(
    `UPDATE concerns SET status = 'under_review' WHERE id = ? AND status = 'submitted'`,
    [id]
  );
  return result.affectedRows;
}

// under_review -> responded (a response is required)
async function respond(id, responderId, response) {
  const [result] = await pool.query(
    `UPDATE concerns
     SET status = 'responded', response = ?, responded_by = ?, responded_at = NOW()
     WHERE id = ? AND status = 'under_review'`,
    [response, responderId, id]
  );
  return result.affectedRows;
}

// responded -> resolved
async function resolve(id) {
  const [result] = await pool.query(
    `UPDATE concerns SET status = 'resolved' WHERE id = ? AND status = 'responded'`,
    [id]
  );
  return result.affectedRows;
}

module.exports = {
  create,
  listForUser,
  findOwn,
  findForTracking,
  listForManage,
  findById,
  startReview,
  respond,
  resolve
};
