import { db, now } from "./db.js";
import { avatarUrl, mediaUrl } from "./serialize.js";

// Tạo một thông báo. Không bao giờ báo cho chính mình.
export function notify({
  to,
  actor,
  type,
  photoId = null,
  data = null,
  replace = false,
}) {
  if (!to || !actor || to === actor) return;
  if (replace) {
    // thả lại cảm xúc khác trên cùng ảnh thì thay thông báo cũ, không báo dồn dập
    db.prepare(
      `DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND photo_id IS ?`,
    ).run(to, actor, type, photoId);
  }
  db.prepare(
    `INSERT INTO notifications (user_id, actor_id, type, photo_id, data, created_at) VALUES (?,?,?,?,?,?)`,
  ).run(to, actor, type, photoId, data ? JSON.stringify(data) : null, now());
}

// Nhóm thông báo -> các type tương ứng (tab ở trang Thông báo)
export const NOTIF_KINDS = {
  comment: ["comment"],
  reaction: ["reaction"],
  friend: ["friend_request", "friend_accepted"],
};
const inList = (kind) => {
  const t = NOTIF_KINDS[kind];
  return t
    ? { sql: ` AND n.type IN (${t.map(() => "?").join(",")})`, args: t }
    : { sql: "", args: [] };
};

export function unreadByKind(uid) {
  const rows = db
    .prepare(
      `SELECT type, COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL GROUP BY type`,
    )
    .all(uid);
  const out = { all: 0, comment: 0, reaction: 0, friend: 0 };
  for (const r of rows) {
    out.all += r.c;
    for (const [k, t] of Object.entries(NOTIF_KINDS))
      if (t.includes(r.type)) out[k] += r.c;
  }
  return out;
}

export const unreadCount = (uid) =>
  db
    .prepare(
      `SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    )
    .get(uid).c;

export function listNotifications(uid, before, limit = 30, kind) {
  const params = [uid];
  let cursor = "";
  const f = inList(kind);
  if (Number.isFinite(before)) {
    cursor = "AND n.id < ?";
    params.push(before);
  }
  const rows = db
    .prepare(
      `
    SELECT n.*, u.name AS actor_name, u.avatar_key, u.google_picture,
      p.id AS pid,
      (SELECT v.storage_key FROM photo_variants v WHERE v.photo_id = p.id AND v.version = p.current_version ORDER BY v.width LIMIT 1) AS thumb
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN photos p ON p.id = n.photo_id AND p.status = 'published'
    WHERE n.user_id = ? ${cursor}${f.sql}
      AND (n.photo_id IS NULL OR p.id IS NOT NULL)
    ORDER BY n.id DESC LIMIT ?`,
    )
    .all(...params, ...f.args, limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      createdAt: r.created_at,
      read: !!r.read_at,
      data: r.data ? JSON.parse(r.data) : null,
      actor: { id: r.actor_id, name: r.actor_name, avatarUrl: avatarUrl(r) },
      photo: r.pid
        ? { id: r.pid, thumbUrl: r.thumb ? mediaUrl(r.thumb) : null }
        : null,
    })),
    next: more && page.length ? page[page.length - 1].id : null,
  };
}

export function markAllRead(uid, kind) {
  const t = NOTIF_KINDS[kind];
  const extra = t ? ` AND type IN (${t.map(() => "?").join(",")})` : "";
  return db
    .prepare(
      `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL${extra}`,
    )
    .run(now(), uid, ...(t || []));
}
