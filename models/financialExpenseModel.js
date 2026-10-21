// All SQL for the financial_report_expenses table (receipt lines of a liquidation report).
// Lines are saved only through financialReportModel.saveSheet, which locks the report and
// checks it is still a DRAFT, all in one transaction.
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

// Applies the changes to a report's receipts on a connection that is ALREADY inside a
// transaction (financialReportModel.saveSheet starts it and checks the report is a draft).
// Every UPDATE/DELETE also checks report_id, so a line of another report is never touched.
async function applyPlan(conn, reportId, { removeIds, updates, inserts }) {
  for (const lineId of removeIds) {
    await conn.query('DELETE FROM financial_report_expenses WHERE id = ? AND report_id = ?', [lineId, reportId]);
  }
  for (const line of updates) {
    await conn.query(
      `UPDATE financial_report_expenses
       SET item = ?, receipt_no = ?, receipt_date = ?, particulars = ?, amount = ?
       WHERE id = ? AND report_id = ?`,
      [line.item, line.receiptNo, line.receiptDate, line.particulars, line.amount, line.id, reportId]
    );
  }
  for (const line of inserts) {
    await conn.query(
      `INSERT INTO financial_report_expenses (report_id, item, receipt_no, receipt_date, particulars, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reportId, line.item, line.receiptNo, line.receiptDate, line.particulars, line.amount]
    );
  }
}

module.exports = { listForReport, applyPlan };
