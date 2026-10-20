// All SQL for the annual_budgets table (one budget per school year, C18).
const pool = require('../db');

async function find(schoolYear) {
  const [rows] = await pool.query(
    'SELECT school_year, amount, updated_at FROM annual_budgets WHERE school_year = ?',
    [schoolYear]
  );
  return rows[0] || null;
}

// Creates the year's budget, or changes it if the year already has one.
// VALUES(column) means "the value this INSERT tried to put in"; it works on MySQL and MariaDB.
async function save(schoolYear, amount, userId) {
  await pool.query(
    `INSERT INTO annual_budgets (school_year, amount, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_by = VALUES(updated_by)`,
    [schoolYear, amount, userId]
  );
}

module.exports = { find, save };
