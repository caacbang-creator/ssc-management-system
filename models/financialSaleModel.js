// All SQL for the financial_report_sales table (products sold during an activity).
// The line total (quantity x unit price) is COMPUTED in the SELECT, never stored.
// Lines can only change while their report is a DRAFT (checked inside the SQL).
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

async function findInReport(reportId, lineId) {
  const [rows] = await pool.query(
    `SELECT id, product, quantity, unit_price
     FROM financial_report_sales
     WHERE id = ? AND report_id = ?`,
    [lineId, reportId]
  );
  return rows[0] || null;
}

// INSERT ... SELECT adds the line only if the report exists AND is a draft
async function add(reportId, line) {
  const [result] = await pool.query(
    `INSERT INTO financial_report_sales (report_id, product, quantity, unit_price)
     SELECT id, ?, ?, ? FROM financial_reports WHERE id = ? AND status = 'draft'`,
    [line.product, line.quantity, line.unitPrice, reportId]
  );
  return result.affectedRows;
}

async function update(reportId, lineId, line) {
  const [result] = await pool.query(
    `UPDATE financial_report_sales s
     JOIN financial_reports f ON f.id = s.report_id
     SET s.product = ?, s.quantity = ?, s.unit_price = ?
     WHERE s.id = ? AND s.report_id = ? AND f.status = 'draft'`,
    [line.product, line.quantity, line.unitPrice, lineId, reportId]
  );
  return result.affectedRows;
}

async function remove(reportId, lineId) {
  const [result] = await pool.query(
    `DELETE s FROM financial_report_sales s
     JOIN financial_reports f ON f.id = s.report_id
     WHERE s.id = ? AND s.report_id = ? AND f.status = 'draft'`,
    [lineId, reportId]
  );
  return result.affectedRows;
}

// Saves the whole sales table in ONE transaction, only while the report is a draft
// (same rules as financialExpenseModel.saveTable). Returns 'ok' or 'locked'.
async function saveTable(reportId, { removeIds, updates, inserts }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT id FROM financial_reports WHERE id = ? AND status = 'draft' FOR UPDATE",
      [reportId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return 'locked';
    }
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
    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { listForReport, saveTable };
