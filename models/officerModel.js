// All SQL for the officers table (the public directory, separate from login accounts)
const pool = require('../db');

async function listAll() {
  const [rows] = await pool.query(
    `SELECT o.id, o.full_name, o.position, o.term, o.photo_path, o.sort_order, c.name AS committee_name
     FROM officers o
     LEFT JOIN committees c ON c.id = o.committee_id
     ORDER BY o.sort_order ASC, o.full_name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, full_name, position, committee_id, term, sort_order FROM officers WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function create(officer) {
  const [result] = await pool.query(
    `INSERT INTO officers (full_name, position, committee_id, term, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [officer.fullName, officer.position, officer.committeeId, officer.term, officer.sortOrder]
  );
  return result.insertId;
}

async function update(id, officer) {
  const [result] = await pool.query(
    `UPDATE officers
     SET full_name = ?, position = ?, committee_id = ?, term = ?, sort_order = ?
     WHERE id = ?`,
    [officer.fullName, officer.position, officer.committeeId, officer.term, officer.sortOrder, id]
  );
  return result.affectedRows;
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM officers WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = { listAll, findById, create, update, remove };
