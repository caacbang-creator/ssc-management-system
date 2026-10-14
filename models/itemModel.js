// All SQL for the items table (things students can borrow)
const pool = require('../db');

// Requests still in progress for an item (used to block risky deletes)
const ACTIVE_COUNT =
  `(SELECT COUNT(*) FROM transactions t
    WHERE t.item_id = i.id AND t.status IN ('pending', 'under_review', 'approved')) AS active_requests`;

async function listAll() {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.description, i.quantity, ${ACTIVE_COUNT}
     FROM items i
     ORDER BY i.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, name, description, quantity FROM items WHERE id = ?',
    [id]
  );
  return rows[0] || null;
}

async function nameExists(name, excludeId) {
  const [rows] = await pool.query(
    'SELECT id FROM items WHERE name = ? AND id <> ?',
    [name, excludeId || 0]
  );
  return rows.length > 0;
}

async function create(item) {
  const [result] = await pool.query(
    'INSERT INTO items (name, description, quantity) VALUES (?, ?, ?)',
    [item.name, item.description, item.quantity]
  );
  return result.insertId;
}

async function update(id, item) {
  const [result] = await pool.query(
    'UPDATE items SET name = ?, description = ?, quantity = ? WHERE id = ?',
    [item.name, item.description, item.quantity, id]
  );
  return result.affectedRows;
}

// Deletes only when no request is still in progress for this item.
// Finished requests keep their history; their item link becomes NULL (ON DELETE SET NULL).
async function removeIfUnused(id) {
  const [result] = await pool.query(
    `DELETE FROM items
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.item_id = ? AND t.status IN ('pending', 'under_review', 'approved')
       )`,
    [id, id]
  );
  return result.affectedRows;
}

module.exports = { listAll, findById, nameExists, create, update, removeIfUnused };
