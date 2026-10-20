// All SQL for the office_code table: one current office code (always one row, id = 1, C25).
const crypto = require('crypto');   // built into Node (not a package)
const pool = require('../db');

// No look-alikes: no 0/O and no 1/I, so a code read off a printed sheet is typed correctly
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

function generate() {
  let code = '';
  // crypto.randomInt is a secure random number (Math.random is predictable)
  for (let i = 0; i < LENGTH; i++) code += LETTERS[crypto.randomInt(LETTERS.length)];
  return code;
}

async function get() {
  const [rows] = await pool.query('SELECT code, updated_at FROM office_code WHERE id = 1');
  return rows[0] || null;
}

// A new code replaces the old one at once, so an old printed code or QR link stops working
async function regenerate(userId) {
  const code = generate();
  await pool.query(
    `INSERT INTO office_code (id, code, updated_by) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE code = VALUES(code), updated_by = VALUES(updated_by)`,
    [code, userId]
  );
  return code;
}

// The President types their own code (already checked by the route: 4-10 letters or digits, capitals)
async function setCustom(code, userId) {
  await pool.query(
    `INSERT INTO office_code (id, code, updated_by) VALUES (1, ?, ?)
     ON DUPLICATE KEY UPDATE code = VALUES(code), updated_by = VALUES(updated_by)`,
    [code, userId]
  );
}

module.exports = { get, regenerate, setCustom, LENGTH };
