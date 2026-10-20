// All SQL for the event_videos table (C21).
// Every change has event_id in its WHERE clause, so a video can only be changed through
// the event it belongs to (another event's video id -> 0 rows -> 404).
const pool = require('../db');

async function listForEvent(eventId) {
  const [rows] = await pool.query(
    `SELECT id, file_path, title, created_at
     FROM event_videos
     WHERE event_id = ?
     ORDER BY created_at ASC, id ASC`,
    [eventId]
  );
  return rows;
}

async function add(eventId, filePath, title) {
  const [result] = await pool.query(
    'INSERT INTO event_videos (event_id, file_path, title) VALUES (?, ?, ?)',
    [eventId, filePath, title]
  );
  return result.insertId;
}

// Returns the deleted video's file_path (so the route can delete the file), or null
async function remove(eventId, videoId) {
  const [rows] = await pool.query(
    'SELECT file_path FROM event_videos WHERE id = ? AND event_id = ?',
    [videoId, eventId]
  );
  if (rows.length === 0) return null;
  await pool.query('DELETE FROM event_videos WHERE id = ? AND event_id = ?', [videoId, eventId]);
  return rows[0].file_path;
}

module.exports = { listForEvent, add, remove };
