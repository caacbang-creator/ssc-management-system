// All SQL for the financial_reports table.
// The remaining balance is COMPUTED here (budget - expenses) and never stored,
// so it can never disagree with the numbers it comes from.
// Every status change has the CURRENT status in its WHERE clause.
const pool = require('../db');

const BALANCE = '(f.budget - f.expenses) AS remaining_balance';

// ---------- Public ----------
async function listPublished() {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.period_start, f.period_end, f.budget, f.expenses, ${BALANCE}, f.published_at
     FROM financial_reports f
     WHERE f.status = 'published'
     ORDER BY f.period_end DESC`
  );
  return rows;
}

async function findPublishedById(id) {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.period_start, f.period_end, f.budget, f.expenses, ${BALANCE},
            f.notes, f.published_at
     FROM financial_reports f
     WHERE f.id = ? AND f.status = 'published'`,
    [id]
  );
  return rows[0] || null;
}

// ---------- Officers ----------
async function listForManage(status) {
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE f.status = ?';
    params.push(status);
  }
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.period_start, f.period_end, f.status, ${BALANCE}, f.updated_at
     FROM financial_reports f
     ${where}
     ORDER BY f.updated_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.period_start, f.period_end, f.budget, f.expenses, ${BALANCE},
            f.notes, f.status, f.review_remarks, f.published_at, f.updated_at,
            CONCAT(u.first_name, ' ', u.last_name) AS author_name,
            CONCAT(r.first_name, ' ', r.last_name) AS reviewer_name
     FROM financial_reports f
     JOIN users u ON u.id = f.created_by
     LEFT JOIN users r ON r.id = f.reviewed_by
     WHERE f.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function create(report, userId) {
  const [result] = await pool.query(
    `INSERT INTO financial_reports (title, period_start, period_end, budget, expenses, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [report.title, report.periodStart, report.periodEnd, report.budget, report.expenses, report.notes, userId]
  );
  return result.insertId;
}

async function updateDraft(id, report) {
  const [result] = await pool.query(
    `UPDATE financial_reports
     SET title = ?, period_start = ?, period_end = ?, budget = ?, expenses = ?, notes = ?
     WHERE id = ? AND status = 'draft'`,
    [report.title, report.periodStart, report.periodEnd, report.budget, report.expenses, report.notes, id]
  );
  return result.affectedRows;
}

async function deleteDraft(id) {
  const [result] = await pool.query(
    `DELETE FROM financial_reports WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// draft -> pending
async function submit(id) {
  const [result] = await pool.query(
    `UPDATE financial_reports SET status = 'pending' WHERE id = ? AND status = 'draft'`,
    [id]
  );
  return result.affectedRows;
}

// pending -> published (President)
async function publish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE financial_reports
     SET status = 'published', reviewed_by = ?, review_remarks = NULL, published_at = NOW()
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

// pending -> draft with remarks (President)
async function returnToDraft(id, reviewerId, remarks) {
  const [result] = await pool.query(
    `UPDATE financial_reports SET status = 'draft', reviewed_by = ?, review_remarks = ?
     WHERE id = ? AND status = 'pending'`,
    [reviewerId, remarks, id]
  );
  return result.affectedRows;
}

// published -> draft (President). Published content is unpublished, never deleted.
async function unpublish(id, reviewerId) {
  const [result] = await pool.query(
    `UPDATE financial_reports SET status = 'draft', reviewed_by = ?, published_at = NULL
     WHERE id = ? AND status = 'published'`,
    [reviewerId, id]
  );
  return result.affectedRows;
}

module.exports = {
  listPublished, findPublishedById, listForManage, findById, create,
  updateDraft, deleteDraft, submit, publish, returnToDraft, unpublish
};
