// All SQL for the transactions table (clearance appointments, item borrowing,
// SSC appointments). Every status change has the CURRENT status in its WHERE clause.
// Transactions are never deleted.
const pool = require('../db');

// Inserts the request and gives it a reference number like T-2026-0007,
// in one transaction so a request never exists without its number.
async function create(t, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO transactions (user_id, type, purpose, preferred_date, preferred_time,
         item_id, quantity, return_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, t.type, t.purpose, t.preferredDate, t.preferredTime, t.itemId, t.quantity, t.returnDate]
    );
    await conn.query(
      `UPDATE transactions
       SET reference_no = CONCAT('T-', YEAR(created_at), '-', LPAD(id, 4, '0'))
       WHERE id = ?`,
      [result.insertId]
    );
    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------- Owner ----------
async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_no, t.type, t.preferred_date, t.status, t.created_at, i.name AS item_name
     FROM transactions t
     LEFT JOIN items i ON i.id = t.item_id
     WHERE t.user_id = ?
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return rows;
}

// Ownership is checked INSIDE the query: another student's request is "not found"
async function findOwn(id, userId) {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_no, t.type, t.purpose, t.preferred_date, t.preferred_time,
            t.quantity, t.return_date, t.status, t.remarks, t.created_at, t.updated_at,
            i.name AS item_name
     FROM transactions t
     LEFT JOIN items i ON i.id = t.item_id
     WHERE t.id = ? AND t.user_id = ?`,
    [id, userId]
  );
  return rows[0] || null;
}

// pending -> cancelled, only by the owner
async function cancelOwn(id, userId) {
  const [result] = await pool.query(
    `UPDATE transactions SET status = 'cancelled'
     WHERE id = ? AND user_id = ? AND status = 'pending'`,
    [id, userId]
  );
  return result.affectedRows;
}

// ---------- Officers ----------
// status and type are optional; when given they were checked against allow-lists
async function listForManage(status, type) {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('t.status = ?');
    params.push(status);
  }
  if (type) {
    conditions.push('t.type = ?');
    params.push(type);
  }
  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_no, t.type, t.preferred_date, t.status, t.created_at,
            CONCAT(u.first_name, ' ', u.last_name) AS requester_name
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.created_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_no, t.type, t.purpose, t.preferred_date, t.preferred_time,
            t.quantity, t.return_date, t.status, t.remarks, t.created_at, t.updated_at,
            i.name AS item_name, i.quantity AS item_stock,
            CONCAT(u.first_name, ' ', u.last_name) AS requester_name,
            u.student_no AS requester_student_no, u.email AS requester_email,
            CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN items i ON i.id = t.item_id
     LEFT JOIN users r ON r.id = t.reviewed_by
     WHERE t.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// pending -> under_review (PRO). Remarks are optional: NULL keeps the old remarks.
async function startReview(id, remarks) {
  const [result] = await pool.query(
    `UPDATE transactions SET status = 'under_review', remarks = COALESCE(?, remarks)
     WHERE id = ? AND status = 'pending'`,
    [remarks, id]
  );
  return result.affectedRows;
}

// under_review -> approved (VP Internal / President)
async function approve(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE transactions SET status = 'approved', reviewed_by = ?, remarks = COALESCE(?, remarks)
     WHERE id = ? AND status = 'under_review'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// under_review -> rejected (VP Internal / President), remarks required
async function reject(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE transactions SET status = 'rejected', reviewed_by = ?, remarks = ?
     WHERE id = ? AND status = 'under_review'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// approved -> completed (PRO / President)
async function complete(id) {
  const [result] = await pool.query(
    `UPDATE transactions SET status = 'completed' WHERE id = ? AND status = 'approved'`,
    [id]
  );
  return result.affectedRows;
}

module.exports = {
  create,
  listForUser,
  findOwn,
  cancelOwn,
  listForManage,
  findById,
  startReview,
  approve,
  reject,
  complete
};
