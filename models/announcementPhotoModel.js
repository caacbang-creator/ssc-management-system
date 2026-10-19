// All SQL for the announcement_photos table.
const pool = require('../db');

// Posters of one announcement in display order (sort_order 1 = the cover)
async function listForAnnouncement(announcementId) {
  const [rows] = await pool.query(
    `SELECT id, file_path, caption, sort_order
     FROM announcement_photos
     WHERE announcement_id = ?
     ORDER BY sort_order ASC`,
    [announcementId]
  );
  return rows;
}

module.exports = { listForAnnouncement };
