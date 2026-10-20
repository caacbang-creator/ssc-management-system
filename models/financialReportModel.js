// All SQL for the financial_reports table.
// A report's totals are COMPUTED here from its expense and sales lines and never stored,
// so they can never disagree with the lines they come from.
// Every status change has the CURRENT status in its WHERE clause.
const pool = require('../db');

const TOTALS = `
  (SELECT COALESCE(SUM(x.amount), 0) FROM financial_report_expenses x WHERE x.report_id = f.id) AS total_expenses,
  (SELECT COALESCE(SUM(s.quantity * s.unit_price), 0) FROM financial_report_sales s WHERE s.report_id = f.id) AS total_sales`;

// ---------- Public ----------
async function listPublished() {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.school_year, f.period_start, f.period_end, f.published_at, ${TOTALS}
     FROM financial_reports f
     WHERE f.status = 'published'
     ORDER BY f.period_end DESC, f.id DESC`
  );
  return rows;
}

async function findPublishedById(id) {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.school_year, f.period_start, f.period_end, f.notes, f.published_at, ${TOTALS}
     FROM financial_reports f
     WHERE f.id = ? AND f.status = 'published'`,
    [id]
  );
  return rows[0] || null;
}

// What the published reports of one school year spent and earned (for the annual budget)
async function yearTotals(schoolYear) {
  const [rows] = await pool.query(
    `SELECT
       (SELECT COALESCE(SUM(x.amount), 0)
        FROM financial_report_expenses x JOIN financial_reports f ON f.id = x.report_id
        WHERE f.school_year = ? AND f.status = 'published') AS spent,
       (SELECT COALESCE(SUM(s.quantity * s.unit_price), 0)
        FROM financial_report_sales s JOIN financial_reports f ON f.id = s.report_id
        WHERE f.school_year = ? AND f.status = 'published') AS sales`,
    [schoolYear, schoolYear]
  );
  return rows[0];
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
    `SELECT f.id, f.title, f.school_year, f.period_start, f.period_end, f.status, f.updated_at, ${TOTALS}
     FROM financial_reports f
     ${where}
     ORDER BY f.updated_at DESC`,
    params
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT f.id, f.title, f.school_year, f.period_start, f.period_end, f.notes, f.status,
            f.review_remarks, f.published_at, f.updated_at, ${TOTALS},
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
    `INSERT INTO financial_reports (title, school_year, period_start, period_end, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'draft', ?)`,
    [report.title, report.schoolYear, report.periodStart, report.periodEnd, report.notes, userId]
  );
  return result.insertId;
}

async function updateDraft(id, report) {
  const [result] = await pool.query(
    `UPDATE financial_reports
     SET title = ?, school_year = ?, period_start = ?, period_end = ?, notes = ?
     WHERE id = ? AND status = 'draft'`,
    [report.title, report.schoolYear, report.periodStart, report.periodEnd, report.notes, id]
  );
  return result.affectedRows;
}

// Its expense and sales lines are deleted with it (ON DELETE CASCADE)
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
  listPublished, findPublishedById, yearTotals, listForManage, findById, create,
  updateDraft, deleteDraft, submit, publish, returnToDraft, unpublish
};
