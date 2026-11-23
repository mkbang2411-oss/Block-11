import { db, now } from "./db.js";
import { avatarUrl, mediaUrl } from "./serialize.js";

// Nhóm loại hoạt động -> dùng cho bộ lọc ở trang cá nhân
export const ACTIVITY_KINDS = {
  photo: ["photo_upload", "photo_edit", "photo_delete"],
  social: ["react", "comment"],
  friend: ["friend_request", "friend_added", "unfriend"],
  account: ["avatar", "rename"],
};

// Ghi nhật ký. Lỗi ghi nhật ký không bao giờ được làm hỏng thao tác chính.
export function logActivity({ user, type, photoId = null, data = null }) {
  try {
    db.prepare(
      `INSERT INTO activity_log (user_id, type, photo_id, data, created_at) VALUES (?,?,?,?,?)`,
    ).run(user, type, photoId, data ? JSON.stringify(data) : null, now());
  } catch (e) {
    console.error("[activity]", e);
  }
}

export function listActivity(uid, { before, limit = 30, kind } = {}) {
  const types = ACTIVITY_KINDS[kind];
  const params = [uid];
  let where = "a.user_id = ?";
  if (types) {
    where += ` AND a.type IN (${types.map(() => "?").join(",")})`;
    params.push(...types);
  }
  if (Number.isFinite(before)) {
    where += " AND a.id < ?";
    params.push(before);
  }
  const rows = db
    .prepare(
      `SELECT a.*, p.id AS pid, p.owner_id AS powner, o.name AS owner_name,
        (SELECT v.storage_key FROM photo_variants v WHERE v.photo_id = p.id AND v.version = p.current_version ORDER BY v.width LIMIT 1) AS thumb
       FROM activity_log a
       LEFT JOIN photos p ON p.id = a.photo_id AND p.status = 'published'
       LEFT JOIN users o ON o.id = p.owner_id
       WHERE ${where} ORDER BY a.id DESC LIMIT ?`,
    )
    .all(...params, limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map((r) => ({
      id: r.id,
      type: r.type,
      createdAt: r.created_at,
      data: r.data ? JSON.parse(r.data) : null,
      photo: r.pid
        ? {
            id: r.pid,
            thumbUrl: r.thumb ? mediaUrl(r.thumb) : null,
            ownerId: r.powner,
            ownerName: r.owner_name,
            mine: r.powner === uid,
          }
        : null,
    })),
    next: more && page.length ? page[page.length - 1].id : null,
  };
}
