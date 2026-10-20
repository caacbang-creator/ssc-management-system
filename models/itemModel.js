// All SQL for the items table (things students can borrow).
// "Units out" is COMPUTED from item_loans that are not returned yet, never stored (C19).
const pool = require('../db');

// Requests still in progress for an item (used to block risky deletes)
const ACTIVE_COUNT =
  `(SELECT COUNT(*) FROM transactions t
    WHERE t.item_id = i.id AND t.status IN ('pending', 'under_review', 'approved')) AS active_requests`;

const UNITS_OUT =
  `(SELECT COALESCE(SUM(l.quantity), 0) FROM item_loans l
    WHERE l.item_id = i.id AND l.returned_at IS NULL) AS units_out`;

// Public list (students): status and units out, but never who borrowed what
async function listAll() {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.description, i.quantity, i.status, i.status_note, i.photo_path, ${UNITS_OUT}, ${ACTIVE_COUNT}
     FROM items i
     ORDER BY i.name ASC`
  );
  return rows;
}

// Custodian list: also the last borrower (the newest loan of each item) and when
async function listForCustodian() {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.description, i.quantity, i.status, i.status_note, i.photo_path, ${UNITS_OUT}, ${ACTIVE_COUNT},
            CONCAT(u.first_name, ' ', u.last_name) AS last_borrower,
            l.released_at AS last_released_at, l.returned_at AS last_returned_at
     FROM items i
     LEFT JOIN item_loans l ON l.id = (
       SELECT l2.id FROM item_loans l2 WHERE l2.item_id = i.id ORDER BY l2.released_at DESC, l2.id DESC LIMIT 1
     )
     LEFT JOIN users u ON u.id = l.borrower_id
     ORDER BY i.name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT i.id, i.name, i.description, i.quantity, i.status, i.status_note, i.photo_path, ${UNITS_OUT}
     FROM items i WHERE i.id = ?`,
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

// photoPath: '/uploads/items/...' or null (no photo yet, C27)
async function create(item) {
  const [result] = await pool.query(
    'INSERT INTO items (name, description, quantity, photo_path) VALUES (?, ?, ?, ?)',
    [item.name, item.description, item.quantity, item.photoPath]
  );
  return result.insertId;
}

// The route passes the photo to keep: the old one, a new upload, or null when removed
async function update(id, item) {
  const [result] = await pool.query(
    'UPDATE items SET name = ?, description = ?, quantity = ?, photo_path = ? WHERE id = ?',
    [item.name, item.description, item.quantity, item.photoPath, id]
  );
  return result.affectedRows;
}

// Available / not available, with an optional reason (C19)
async function setStatus(id, status, note) {
  const [result] = await pool.query(
    'UPDATE items SET status = ?, status_note = ? WHERE id = ?',
    [status, note, id]
  );
  return result.affectedRows;
}

// Deletes only when no request is in progress AND the item was never lent out.
// An item with a borrowing history keeps it: mark it "not available" instead.
async function removeIfUnused(id) {
  const [result] = await pool.query(
    `DELETE FROM items
     WHERE id = ?
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.item_id = ? AND t.status IN ('pending', 'under_review', 'approved')
       )
       AND NOT EXISTS (SELECT 1 FROM item_loans l WHERE l.item_id = ?)`,
    [id, id, id]
  );
  return result.affectedRows;
}

module.exports = { listAll, listForCustodian, findById, nameExists, create, update, setStatus, removeIfUnused };
