// All SQL for the event_photos table.
const pool = require('../db');

// Photos of one event in display order (sort_order 1 = the big tile)
async function listForEvent(eventId) {
  const [rows] = await pool.query(
    `SELECT id, file_path, caption, sort_order
     FROM event_photos
     WHERE event_id = ?
     ORDER BY sort_order ASC`,
    [eventId]
  );
  return rows;
}

module.exports = { listForEvent };
