// All SQL for the about_ssc table (always one row, id = 1)
const pool = require('../db');

async function get() {
  const [rows] = await pool.query(
    'SELECT overview, mission, vision, updated_at FROM about_ssc WHERE id = 1'
  );
  return rows[0] || null;
}

async function update(about, userId) {
  const [result] = await pool.query(
    'UPDATE about_ssc SET overview = ?, mission = ?, vision = ?, updated_by = ? WHERE id = 1',
    [about.overview, about.mission, about.vision, userId]
  );
  return result.affectedRows;
}

module.exports = { get, update };
