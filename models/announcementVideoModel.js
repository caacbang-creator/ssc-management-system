// All SQL for the announcement_videos table (C21).
// Every change has announcement_id in its WHERE clause, so a video can only be changed
// through the announcement it belongs to (another post's video id -> 0 rows -> 404).
const pool = require('../db');

async function listForAnnouncement(announcementId) {
  const [rows] = await pool.query(
    `SELECT id, file_path, title, created_at
     FROM announcement_videos
     WHERE announcement_id = ?
     ORDER BY created_at ASC, id ASC`,
    [announcementId]
  );
  return rows;
}

async function add(announcementId, filePath, title) {
  const [result] = await pool.query(
    'INSERT INTO announcement_videos (announcement_id, file_path, title) VALUES (?, ?, ?)',
    [announcementId, filePath, title]
  );
  return result.insertId;
}

// Returns the deleted video's file_path (so the route can delete the file), or null
async function remove(announcementId, videoId) {
  const [rows] = await pool.query(
    'SELECT file_path FROM announcement_videos WHERE id = ? AND announcement_id = ?',
    [videoId, announcementId]
  );
  if (rows.length === 0) return null;
  await pool.query(
    'DELETE FROM announcement_videos WHERE id = ? AND announcement_id = ?',
    [videoId, announcementId]
  );
  return rows[0].file_path;
}

module.exports = { listForAnnouncement, add, remove };
