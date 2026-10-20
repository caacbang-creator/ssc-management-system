// All SQL for the event_photos table.
// Every change has event_id in its WHERE clause, so a photo can only be changed
// through the event it belongs to (another event's photo id -> 0 rows -> 404).
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

// Adds photos at the end of the list. The transaction locks this event's rows,
// so two uploads at the same moment cannot get the same sort_order.
async function addMany(eventId, filePaths) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS last FROM event_photos WHERE event_id = ? FOR UPDATE',
      [eventId]
    );
    let order = rows[0].last;
    for (const filePath of filePaths) {
      order += 1;
      await conn.query(
        'INSERT INTO event_photos (event_id, file_path, sort_order) VALUES (?, ?, ?)',
        [eventId, filePath, order]
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
async function updateCaption(eventId, photoId, caption) {
  const [result] = await pool.query(
    'UPDATE event_photos SET caption = ? WHERE id = ? AND event_id = ?',
    [caption, photoId, eventId]
  );
  return result.affectedRows;
}

// Swaps a photo with its neighbour. direction: 'up' (earlier) or 'down' (later).
// Returns 'ok', 'not_found', or 'edge' (already first / last).
async function move(eventId, photoId, direction) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [photos] = await conn.query(
      'SELECT id, sort_order FROM event_photos WHERE event_id = ? ORDER BY sort_order FOR UPDATE',
      [eventId]
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
    // UNIQUE(event_id, sort_order) blocks a direct swap, so park one photo at 0 first
    await conn.query('UPDATE event_photos SET sort_order = 0 WHERE id = ?', [a.id]);
    await conn.query('UPDATE event_photos SET sort_order = ? WHERE id = ?', [a.sort_order, b.id]);
    await conn.query('UPDATE event_photos SET sort_order = ? WHERE id = ?', [b.sort_order, a.id]);
    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Returns the deleted photo's file_path (so the route can delete the file), or null
async function remove(eventId, photoId) {
  const [rows] = await pool.query(
    'SELECT file_path FROM event_photos WHERE id = ? AND event_id = ?',
    [photoId, eventId]
  );
  if (rows.length === 0) return null;
  await pool.query('DELETE FROM event_photos WHERE id = ? AND event_id = ?', [photoId, eventId]);
  return rows[0].file_path;
}

module.exports = { listForEvent, addMany, updateCaption, move, remove };
