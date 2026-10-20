// All SQL for the announcement_photos table (posters).
// Every change has announcement_id in its WHERE clause, so a poster can only be changed
// through the announcement it belongs to (another post's poster id -> 0 rows -> 404).
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

// Adds posters at the end of the list. The transaction locks this post's rows,
// so two uploads at the same moment cannot get the same sort_order.
async function addMany(announcementId, filePaths) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS last FROM announcement_photos
       WHERE announcement_id = ? FOR UPDATE`,
      [announcementId]
    );
    let order = rows[0].last;
    for (const filePath of filePaths) {
      order += 1;
      await conn.query(
        'INSERT INTO announcement_photos (announcement_id, file_path, sort_order) VALUES (?, ?, ?)',
        [announcementId, filePath, order]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// caption: text, or null to clear it
async function updateCaption(announcementId, photoId, caption) {
  const [result] = await pool.query(
    'UPDATE announcement_photos SET caption = ? WHERE id = ? AND announcement_id = ?',
    [caption, photoId, announcementId]
  );
  return result.affectedRows;
}

// Swaps a poster with its neighbour. direction: 'up' (earlier) or 'down' (later).
// Returns 'ok', 'not_found', or 'edge' (already first / last).
async function move(announcementId, photoId, direction) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [photos] = await conn.query(
      `SELECT id, sort_order FROM announcement_photos
       WHERE announcement_id = ? ORDER BY sort_order FOR UPDATE`,
      [announcementId]
    );
    const index = photos.findIndex((p) => p.id === photoId);
    const otherIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || otherIndex < 0 || otherIndex >= photos.length) {
      const result = index === -1 ? 'not_found' : 'edge';
      await conn.rollback();
      return result;
    }
    const a = photos[index];
    const b = photos[otherIndex];
    // UNIQUE(announcement_id, sort_order) blocks a direct swap, so park one poster at 0 first
    await conn.query('UPDATE announcement_photos SET sort_order = 0 WHERE id = ?', [a.id]);
    await conn.query('UPDATE announcement_photos SET sort_order = ? WHERE id = ?', [a.sort_order, b.id]);
    await conn.query('UPDATE announcement_photos SET sort_order = ? WHERE id = ?', [b.sort_order, a.id]);
    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Returns the deleted poster's file_path (so the route can delete the file), or null
async function remove(announcementId, photoId) {
  const [rows] = await pool.query(
    'SELECT file_path FROM announcement_photos WHERE id = ? AND announcement_id = ?',
    [photoId, announcementId]
  );
  if (rows.length === 0) return null;
  await pool.query(
    'DELETE FROM announcement_photos WHERE id = ? AND announcement_id = ?',
    [photoId, announcementId]
  );
  return rows[0].file_path;
}

module.exports = { listForAnnouncement, addMany, updateCaption, move, remove };
