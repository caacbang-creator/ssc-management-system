// All SQL for the committees table
const pool = require('../db');

// Includes how many officers are in each committee
async function listAll() {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.description, COUNT(o.id) AS officer_count
     FROM committees c
     LEFT JOIN officers o ON o.committee_id = c.id
     GROUP BY c.id, c.name, c.description
     ORDER BY c.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, description FROM committees WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

// Used to give a clear "name already used" message; excludeId skips the record being edited
async function nameExists(name, excludeId) {
  const [rows] = await pool.query(
    'SELECT id FROM committees WHERE name = ? AND id <> ?',
    [name, excludeId || 0]
  );
  return rows.length > 0;
}

async function create(committee) {
  const [result] = await pool.query(
    'INSERT INTO committees (name, description) VALUES (?, ?)',
    [committee.name, committee.description]
  );
  return result.insertId;
}

async function update(id, committee) {
  const [result] = await pool.query(
    'UPDATE committees SET name = ?, description = ? WHERE id = ?',
    [committee.name, committee.description, id]
  );
  return result.affectedRows;
}

// Officers in this committee are kept; their committee becomes empty (ON DELETE SET NULL)
async function remove(id) {
  const [result] = await pool.query('DELETE FROM committees WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = { listAll, findById, nameExists, create, update, remove };
