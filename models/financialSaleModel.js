// All SQL for the financial_report_sales table (products sold during an activity).
// The line total (quantity x unit price) is COMPUTED in the SELECT, never stored.
// Lines are saved only through financialReportModel.saveSheet (one transaction, draft only).
const pool = require('../db');

async function listForReport(reportId) {
  const [rows] = await pool.query(
    `SELECT id, product, quantity, unit_price, (quantity * unit_price) AS line_total
     FROM financial_report_sales
     WHERE report_id = ?
     ORDER BY id ASC`,
    [reportId]
  );
  return rows;
}

// Applies the changes to a report's sales lines on a connection that is ALREADY inside a
// transaction (financialReportModel.saveSheet starts it and checks the report is a draft).
// Every UPDATE/DELETE also checks report_id, so a line of another report is never touched.
async function applyPlan(conn, reportId, { removeIds, updates, inserts }) {
  for (const lineId of removeIds) {
    await conn.query('DELETE FROM financial_report_sales WHERE id = ? AND report_id = ?', [lineId, reportId]);
  }
  for (const line of updates) {
    await conn.query(
      'UPDATE financial_report_sales SET product = ?, quantity = ?, unit_price = ? WHERE id = ? AND report_id = ?',
      [line.product, line.quantity, line.unitPrice, line.id, reportId]
    );
  }
  for (const line of inserts) {
    await conn.query(
      'INSERT INTO financial_report_sales (report_id, product, quantity, unit_price) VALUES (?, ?, ?, ?)',
      [reportId, line.product, line.quantity, line.unitPrice]
    );
  }
}

module.exports = { listForReport, applyPlan };
