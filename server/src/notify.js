import { db, now } from './db.js';
import { avatarUrl, mediaUrl } from './serialize.js';

// Tạo một thông báo. Không bao giờ báo cho chính mình.
export function notify({ to, actor, type, photoId = null, data = null, replace = false }) {
  if (!to || !actor || to === actor) return;
  if (replace) { // thả lại cảm xúc khác trên cùng ảnh thì thay thông báo cũ, không báo dồn dập
    db.prepare(`DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND photo_id IS ?`).run(to, actor, type, photoId);
  }
  db.prepare(`INSERT INTO notifications (user_id, actor_id, type, photo_id, data, created_at) VALUES (?,?,?,?,?,?)`)
    .run(to, actor, type, photoId, data ? JSON.stringify(data) : null, now());
}

export const unreadCount = (uid) => db.prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL`).get(uid).c;

export function listNotifications(uid, before, limit = 30) {
  const params = [uid]; let cursor = '';
  if (Number.isFinite(before)) { cursor = 'AND n.id < ?'; params.push(before); }
  const rows = db.prepare(`
    SELECT n.*, u.name AS actor_name, u.avatar_key, u.google_picture,
      p.id AS pid,
      (SELECT v.storage_key FROM photo_variants v WHERE v.photo_id = p.id AND v.version = p.current_version ORDER BY v.width LIMIT 1) AS thumb
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN photos p ON p.id = n.photo_id AND p.status = 'published'
    WHERE n.user_id = ? ${cursor}
      AND (n.photo_id IS NULL OR p.id IS NOT NULL)
    ORDER BY n.id DESC LIMIT ?`).all(...params, limit + 1);
  const more = rows.length > limit; const page = rows.slice(0, limit);
  return {
    items: page.map((r) => ({
      id: r.id, type: r.type, createdAt: r.created_at, read: !!r.read_at,
      data: r.data ? JSON.parse(r.data) : null,
      actor: { id: r.actor_id, name: r.actor_name, avatarUrl: avatarUrl(r) },
      photo: r.pid ? { id: r.pid, thumbUrl: r.thumb ? mediaUrl(r.thumb) : null } : null,
    })),
    next: more && page.length ? page[page.length - 1].id : null,
  };
}

export const markAllRead = (uid) => db.prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`).run(now(), uid);
