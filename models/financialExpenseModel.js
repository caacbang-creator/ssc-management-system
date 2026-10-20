// All SQL for the financial_report_expenses table (receipt lines of a liquidation report).
// Lines can only change while their report is a DRAFT: every change joins the report and
// checks its status inside the SQL, and the line's report_id is checked too (another
// report's line -> 0 rows -> 404).
const pool = require('../db');

async function listForReport(reportId) {
  const [rows] = await pool.query(
    `SELECT id, item, receipt_no, receipt_date, particulars, amount
     FROM financial_report_expenses
     WHERE report_id = ?
     ORDER BY item ASC, receipt_date ASC, id ASC`,
    [reportId]
  );
  return rows;
}

async function findInReport(reportId, lineId) {
  const [rows] = await pool.query(
    `SELECT id, item, receipt_no, receipt_date, particulars, amount
     FROM financial_report_expenses
     WHERE id = ? AND report_id = ?`,
    [lineId, reportId]
  );
  return rows[0] || null;
}

// INSERT ... SELECT adds the line only if the report exists AND is a draft
async function add(reportId, line) {
  const [result] = await pool.query(
    `INSERT INTO financial_report_expenses (report_id, item, receipt_no, receipt_date, particulars, amount)
     SELECT id, ?, ?, ?, ?, ? FROM financial_reports WHERE id = ? AND status = 'draft'`,
    [line.item, line.receiptNo, line.receiptDate, line.particulars, line.amount, reportId]
  );
  return result.affectedRows;
}

async function update(reportId, lineId, line) {
  const [result] = await pool.query(
    `UPDATE financial_report_expenses x
     JOIN financial_reports f ON f.id = x.report_id
     SET x.item = ?, x.receipt_no = ?, x.receipt_date = ?, x.particulars = ?, x.amount = ?
     WHERE x.id = ? AND x.report_id = ? AND f.status = 'draft'`,
    [line.item, line.receiptNo, line.receiptDate, line.particulars, line.amount, lineId, reportId]
  );
  return result.affectedRows;
}

async function remove(reportId, lineId) {
  const [result] = await pool.query(
    `DELETE x FROM financial_report_expenses x
     JOIN financial_reports f ON f.id = x.report_id
     WHERE x.id = ? AND x.report_id = ? AND f.status = 'draft'`,
    [lineId, reportId]
  );
  return result.affectedRows;
}

module.exports = { listForReport, findInReport, add, update, remove };
