// All SQL for the duty_schedule table: the weekly Officer of the Day (OOTD) schedule (C25).
// day_of_week uses MySQL's DAYOFWEEK() numbering: 1 = Sunday, 2 = Monday ... 7 = Saturday.
const pool = require('../db');

// The whole week, Monday first (Sunday = 1 is moved to the end), joined with the officer's name
async function listWeek() {
  const [rows] = await pool.query(
    `SELECT d.id, d.user_id, d.day_of_week, d.start_time, DATE(d.created_at) AS since,
            u.first_name, u.last_name, u.role
     FROM duty_schedule d
     JOIN users u ON u.id = d.user_id
     ORDER BY (d.day_of_week + 5) % 7, d.start_time, u.first_name`
  );
  return rows;
}

// One officer's weekly duties (for the Performance header and the scheduled-days count)
async function listForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, day_of_week, start_time
     FROM duty_schedule
     WHERE user_id = ?
     ORDER BY (day_of_week + 5) % 7`,
    [userId]
  );
  return rows;
}

async function create(userId, dayOfWeek, startTime) {
  const [result] = await pool.query(
    'INSERT INTO duty_schedule (user_id, day_of_week, start_time) VALUES (?, ?, ?)',
    [userId, dayOfWeek, startTime]
  );
  return result.insertId;
}

async function exists(userId, dayOfWeek) {
  const [rows] = await pool.query(
    'SELECT id FROM duty_schedule WHERE user_id = ? AND day_of_week = ?',
    [userId, dayOfWeek]
  );
  return rows.length > 0;
}

async function remove(id) {
  const [result] = await pool.query('DELETE FROM duty_schedule WHERE id = ?', [id]);
  return result.affectedRows;
}

// Today's duty row for this officer, or null. "Today" is the database server's date.
async function isScheduledToday(userId) {
  const [rows] = await pool.query(
    `SELECT id, day_of_week, start_time
     FROM duty_schedule
     WHERE user_id = ? AND day_of_week = DAYOFWEEK(CURDATE())`,
    [userId]
  );
  return rows[0] || null;
}

// Everyone scheduled today who has NOT timed in as duty yet (Office Now: "not in yet")
async function listScheduledNotInToday() {
  const [rows] = await pool.query(
    `SELECT d.user_id, d.start_time, u.first_name, u.last_name, u.role, o.photo_path,
            (CURTIME() > ADDTIME(d.start_time, '00:15:00')) AS past_late_mark
     FROM duty_schedule d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN officers o ON o.user_id = u.id
     WHERE d.day_of_week = DAYOFWEEK(CURDATE())
       AND NOT EXISTS (
         SELECT 1 FROM office_logs l
         WHERE l.user_id = d.user_id AND l.log_date = CURDATE() AND l.log_type = 'duty'
       )
     ORDER BY d.start_time, u.first_name`
  );
  return rows;
}

module.exports = { listWeek, listForUser, create, exists, remove, isScheduledToday, listScheduledNotInToday };
