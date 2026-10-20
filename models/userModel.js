// All SQL for the users table
const pool = require('../db');

// Used on every request to load the logged-in user (never returns the password hash)
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT id, student_no, first_name, last_name, email, role, requested_role, officer_request_status
     FROM users WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

// Used by login: this is the only query that reads password_hash
async function findByEmailForLogin(email) {
  const [rows] = await pool.query(
    'SELECT id, password_hash FROM users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

// Used by registration to give a clear "already registered" message
async function findDuplicate(studentNo, email) {
  const [rows] = await pool.query(
    'SELECT student_no, email FROM users WHERE student_no = ? OR email = ?',
    [studentNo, email]
  );
  return rows;
}

async function create(user) {
  const [result] = await pool.query(
    `INSERT INTO users (student_no, first_name, last_name, email, password_hash,
       requested_role, officer_request_status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user.studentNo,
      user.firstName,
      user.lastName,
      user.email,
      user.passwordHash,
      user.requestedRole,
      user.requestedRole ? 'pending' : 'none'
    ]
  );
  return result.insertId;
}

async function listPendingRequests() {
  const [rows] = await pool.query(
    `SELECT id, student_no, first_name, last_name, email, requested_role, created_at
     FROM users
     WHERE officer_request_status = 'pending'
     ORDER BY created_at ASC`
  );
  return rows;
}

// The WHERE clause only matches a request that is still pending,
// so approving twice (or approving a rejected request) changes nothing.
async function approveRequest(id) {
  const [result] = await pool.query(
    `UPDATE users
     SET role = requested_role, requested_role = NULL, officer_request_status = 'none'
     WHERE id = ? AND officer_request_status = 'pending' AND requested_role IS NOT NULL`,
    [id]
  );
  return result.affectedRows;
}

async function rejectRequest(id) {
  const [result] = await pool.query(
    `UPDATE users SET officer_request_status = 'rejected'
     WHERE id = ? AND officer_request_status = 'pending'`,
    [id]
  );
  return result.affectedRows;
}

// Walk-in loans: the custodian finds the borrower by student number (C19)
async function findByStudentNo(studentNo) {
  const [rows] = await pool.query(
    'SELECT id, student_no, first_name, last_name FROM users WHERE student_no = ?',
    [studentNo]
  );
  return rows[0] || null;
}

// ---------- Office duty (C25) ----------
// Officers = every user whose role is not student, with their directory photo and position
// (officers.user_id links a directory entry to a login; NULL photo = initials are shown)
async function listOfficers() {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.role, o.photo_path, o.position
     FROM users u
     LEFT JOIN officers o ON o.user_id = u.id
     WHERE u.role <> 'student'
     ORDER BY COALESCE(o.sort_order, 999), u.first_name`
  );
  return rows;
}

// One officer (not a student) with photo, or null
async function findOfficerById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.role, o.photo_path, o.position
     FROM users u
     LEFT JOIN officers o ON o.user_id = u.id
     WHERE u.id = ? AND u.role <> 'student'`,
    [id]
  );
  return rows[0] || null;
}

// Office Time In asks for the password again. Like findByEmailForLogin, this reads the hash
// only to compare it with bcrypt; the hash never leaves the route.
async function findPasswordHash(id) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [id]);
  return rows[0] ? rows[0].password_hash : null;
}

module.exports = {
  findById,
  findByStudentNo,
  listOfficers,
  findOfficerById,
  findPasswordHash,
  findByEmailForLogin,
  findDuplicate,
  create,
  listPendingRequests,
  approveRequest,
  rejectRequest
};
