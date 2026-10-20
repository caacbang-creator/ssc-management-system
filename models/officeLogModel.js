// All SQL for the office_logs table: office check-in / check-out (C25).
// Every time comes from the DATABASE clock (NOW(), CURDATE()), never from the form or the browser,
// so DevTools cannot fake a time. The officer is always the logged-in user (passed in by the route).
const pool = require('../db');

// Name, role and directory photo of the person on a log row
const PERSON = `
  u.id AS user_id, u.first_name, u.last_name, u.role, o.photo_path, o.position`;
const PERSON_JOINS = `
  JOIN users u ON u.id = l.user_id
  LEFT JOIN officers o ON o.user_id = u.id`;

// The officer's log that is still open TODAY, or null.
// A log without a time-out from an earlier day is a "missing time-out", not "still in the office",
// so it never blocks a new Time In.
async function findOpenLog(userId) {
  const [rows] = await pool.query(
    `SELECT id, log_type, time_in
     FROM office_logs
     WHERE user_id = ? AND log_date = CURDATE() AND time_out IS NULL
     ORDER BY time_in DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

// Has this officer already logged a duty today (open or closed)?
async function hasDutyToday(userId) {
  const [rows] = await pool.query(
    `SELECT id FROM office_logs WHERE user_id = ? AND log_date = CURDATE() AND log_type = 'duty'`,
    [userId]
  );
  return rows.length > 0;
}

// Records a Time In. For a duty, late is worked out IN SQL: Time In more than 15 minutes after the
// scheduled start (startTime comes from duty_schedule, not from the form). Returns the time in.
async function timeIn(userId, logType, startTime) {
  const lateSql = logType === 'duty' ? "CURTIME() > ADDTIME(?, '00:15:00')" : '0';
  const params = logType === 'duty' ? [userId, logType, startTime] : [userId, logType];
  const [result] = await pool.query(
    `INSERT INTO office_logs (user_id, log_type, log_date, time_in, is_late)
     VALUES (?, ?, CURDATE(), NOW(), ${lateSql})`,
    params
  );
  const [rows] = await pool.query('SELECT time_in, is_late FROM office_logs WHERE id = ?', [result.insertId]);
  return rows[0];
}

// Closes today's open log. Returns affectedRows (0 = not checked in).
async function timeOut(userId) {
  const [result] = await pool.query(
    `UPDATE office_logs SET time_out = NOW()
     WHERE user_id = ? AND log_date = CURDATE() AND time_out IS NULL`,
    [userId]
  );
  return result.affectedRows;
}

// Office Now: who is in right now, with how long they have been in (computed in SQL)
async function listPresentNow() {
  const [rows] = await pool.query(
    `SELECT l.id, l.log_type, l.time_in, l.is_late, ${PERSON},
            TIMESTAMPDIFF(MINUTE, l.time_in, NOW()) AS minutes_in
     FROM office_logs l ${PERSON_JOINS}
     WHERE l.log_date = CURDATE() AND l.time_out IS NULL
     ORDER BY l.log_type = 'duty' DESC, l.time_in ASC`
  );
  return rows;
}

// Office Now: who came in today and has already left
async function listLeftToday() {
  const [rows] = await pool.query(
    `SELECT l.id, l.log_type, l.time_in, l.time_out, l.is_late, ${PERSON},
            TIMESTAMPDIFF(MINUTE, l.time_in, l.time_out) AS minutes_in
     FROM office_logs l ${PERSON_JOINS}
     WHERE l.log_date = CURDATE() AND l.time_out IS NOT NULL
     ORDER BY l.time_out DESC`
  );
  return rows;
}

// ---------- Performance (one officer, a date range) ----------

// Duty and visit totals with COUNT / SUM. Hours count CLOSED logs only.
// "Missing time-out" = no time-out on a day before today.
async function totalsForUser(userId, from, to) {
  const [rows] = await pool.query(
    `SELECT
       COALESCE(SUM(log_type = 'duty'), 0) AS duties_done,
       COALESCE(SUM(log_type = 'duty' AND is_late = 1), 0) AS late_count,
       COALESCE(SUM(time_out IS NULL AND log_date < CURDATE()), 0) AS missing_timeouts,
       COALESCE(SUM(log_type = 'visit'), 0) AS visits,
       COALESCE(SUM(CASE WHEN log_type = 'duty' AND time_out IS NOT NULL
                         THEN TIMESTAMPDIFF(MINUTE, time_in, time_out) END), 0) AS duty_minutes,
       COALESCE(SUM(CASE WHEN log_type = 'visit' AND time_out IS NOT NULL
                         THEN TIMESTAMPDIFF(MINUTE, time_in, time_out) END), 0) AS visit_minutes
     FROM office_logs
     WHERE user_id = ? AND log_date BETWEEN ? AND ?`,
    [userId, from, to]
  );
  return rows[0];
}

// Duties done per month (GROUP BY), e.g. [{ month: '2026-09', duties: 4 }]
async function dutiesPerMonth(userId, from, to) {
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(log_date, '%Y-%m') AS month, COUNT(*) AS duties
     FROM office_logs
     WHERE user_id = ? AND log_type = 'duty' AND log_date BETWEEN ? AND ?
     GROUP BY DATE_FORMAT(log_date, '%Y-%m')
     ORDER BY month`,
    [userId, from, to]
  );
  return rows;
}

// Duty logs per officer in the range (GROUP BY), for the all-officers attendance chart
async function dutiesDoneByUser(from, to) {
  const [rows] = await pool.query(
    `SELECT user_id, COUNT(*) AS duties
     FROM office_logs
     WHERE log_type = 'duty' AND log_date BETWEEN ? AND ?
     GROUP BY user_id`,
    [from, to]
  );
  return rows;
}

module.exports = {
  findOpenLog, hasDutyToday, timeIn, timeOut, listPresentNow, listLeftToday,
  totalsForUser, dutiesPerMonth, dutiesDoneByUser
};
