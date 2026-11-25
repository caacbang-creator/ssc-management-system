// Session store kept in MySQL instead of server memory.
// With the default memory store, every redeploy or restart logs out all users.
// express-session calls get / set / destroy / touch; all SQL stays in this model.
const session = require('express-session');
const pool = require('../db');

class MySQLSessionStore extends session.Store {
  // Returns the saved session data, or nothing if it is missing or expired
  get(sid, callback) {
    pool.query(
      'SELECT data FROM sessions WHERE session_id = ? AND expires > ?',
      [sid, Date.now()]
    )
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null))
      .catch(callback);
  }

  // Saves (or replaces) the session; also clears out old expired rows
  set(sid, sess, callback) {
    const expires = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 2 * 60 * 60 * 1000;
    pool.query(
      `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
      [sid, expires, JSON.stringify(sess)]
    )
      .then(() => pool.query('DELETE FROM sessions WHERE expires < ?', [Date.now()]))
      .then(() => callback && callback(null))
      .catch((err) => callback && callback(err));
  }

  // Called on logout
  destroy(sid, callback) {
    pool.query('DELETE FROM sessions WHERE session_id = ?', [sid])
      .then(() => callback && callback(null))
      .catch((err) => callback && callback(err));
  }

  // Keeps an active user's session from expiring
  touch(sid, sess, callback) {
    this.set(sid, sess, callback);
  }
}

module.exports = MySQLSessionStore;
