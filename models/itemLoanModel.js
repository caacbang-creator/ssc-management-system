// All SQL for the item_loans table: the Property Custodian's borrowing log (C19).
// A loan is "out" while returned_at IS NULL. Nothing about availability is stored:
// units out = SUM(quantity) of the item's open loans.
const pool = require('../db');

const LOAN_COLUMNS = `
  l.id, l.item_id, l.quantity, l.released_at, l.due_date, l.returned_at, l.return_condition, l.notes,
  l.transaction_id, t.reference_no,
  i.name AS item_name,
  u.student_no, CONCAT(u.first_name, ' ', u.last_name) AS borrower_name,
  CONCAT(rb.first_name, ' ', rb.last_name) AS released_by_name,
  CONCAT(tb.first_name, ' ', tb.last_name) AS returned_by_name,
  (l.returned_at IS NULL AND l.due_date < CURDATE()) AS overdue`;

const LOAN_JOINS = `
  FROM item_loans l
  JOIN items i ON i.id = l.item_id
  JOIN users u ON u.id = l.borrower_id
  LEFT JOIN transactions t ON t.id = l.transaction_id
  LEFT JOIN users rb ON rb.id = l.released_by
  LEFT JOIN users tb ON tb.id = l.returned_by`;

// Everything that is out right now, overdue first
async function listOpen() {
  const [rows] = await pool.query(
    `SELECT ${LOAN_COLUMNS} ${LOAN_JOINS}
     WHERE l.returned_at IS NULL
     ORDER BY overdue DESC, l.due_date ASC`
  );
  return rows;
}

// One item's full history, newest first (the first row is the last borrower)
async function listForItem(itemId) {
  const [rows] = await pool.query(
    `SELECT ${LOAN_COLUMNS} ${LOAN_JOINS}
     WHERE l.item_id = ?
     ORDER BY l.released_at DESC, l.id DESC`,
    [itemId]
  );
  return rows;
}

// Approved Item Borrowing requests that have not been handed over yet
async function listReadyToRelease() {
  const [rows] = await pool.query(
    `SELECT t.id, t.reference_no, t.quantity, t.preferred_date, t.return_date, t.purpose,
            i.id AS item_id, i.name AS item_name, i.status AS item_status,
            u.id AS borrower_id, u.student_no, CONCAT(u.first_name, ' ', u.last_name) AS borrower_name
     FROM transactions t
     JOIN items i ON i.id = t.item_id
     JOIN users u ON u.id = t.user_id
     LEFT JOIN item_loans l ON l.transaction_id = t.id
     WHERE t.type = 'item_borrowing' AND t.status = 'approved' AND l.id IS NULL
     ORDER BY t.preferred_date ASC`
  );
  return rows;
}

// Records a handover. loan: { itemId, borrowerId, transactionId (or null), quantity, dueDate, notes, releasedBy }
// Returns 'ok', 'not_found', 'unavailable', 'not_enough' or 'not_ready'.
// The item row is locked (FOR UPDATE), so two handovers at the same moment cannot
// lend out more units than exist.
async function release(loan) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.query(
      'SELECT id, quantity, status FROM items WHERE id = ? FOR UPDATE',
      [loan.itemId]
    );
    if (items.length === 0) {
      await conn.rollback();
      return 'not_found';
    }
    if (items[0].status !== 'available') {
      await conn.rollback();
      return 'unavailable';
    }
    const [out] = await conn.query(
      'SELECT COALESCE(SUM(quantity), 0) AS units FROM item_loans WHERE item_id = ? AND returned_at IS NULL',
      [loan.itemId]
    );
    if (Number(out[0].units) + loan.quantity > items[0].quantity) {
      await conn.rollback();
      return 'not_enough';
    }
    // From a request: it must still be an approved Item Borrowing request for this item and borrower
    if (loan.transactionId) {
      const [requests] = await conn.query(
        `SELECT id FROM transactions
         WHERE id = ? AND type = 'item_borrowing' AND status = 'approved' AND item_id = ? AND user_id = ?`,
        [loan.transactionId, loan.itemId, loan.borrowerId]
      );
      if (requests.length === 0) {
        await conn.rollback();
        return 'not_ready';
      }
    }
    await conn.query(
      `INSERT INTO item_loans (item_id, borrower_id, transaction_id, quantity, due_date, notes, released_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [loan.itemId, loan.borrowerId, loan.transactionId, loan.quantity, loan.dueDate, loan.notes, loan.releasedBy]
    );
    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    // UNIQUE(transaction_id): this request was handed over a moment ago by someone else
    if (err.code === 'ER_DUP_ENTRY') return 'not_ready';
    throw err;
  } finally {
    conn.release();
  }
}

// Records the return. condition: 'good', 'damaged' or 'lost'. A request-based loan also
// completes its request (approved -> completed) in the same transaction.
// Returns false when the loan does not exist or was already returned.
async function markReturned(loanId, condition, note, returnedBy) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [loans] = await conn.query(
      'SELECT transaction_id FROM item_loans WHERE id = ? AND returned_at IS NULL FOR UPDATE',
      [loanId]
    );
    if (loans.length === 0) {
      await conn.rollback();
      return false;
    }
    await conn.query(
      `UPDATE item_loans
       SET returned_at = NOW(), returned_by = ?, return_condition = ?,
           notes = CONCAT_WS(' / Return: ', notes, ?)
       WHERE id = ?`,
      [returnedBy, condition, note, loanId]
    );
    if (loans[0].transaction_id) {
      await conn.query(
        `UPDATE transactions SET status = 'completed' WHERE id = ? AND status = 'approved'`,
        [loans[0].transaction_id]
      );
    }
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { listOpen, listForItem, listReadyToRelease, release, markReturned };
