import { db } from './db.js';

export const mediaUrl = (key) => `/media/${key}`;

export function avatarUrl(u) {
  if (u.avatar_key) return mediaUrl(u.avatar_key);
  return u.google_picture || null;
}
export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: avatarUrl(u), hasCustomAvatar: !!u.avatar_key });

const marks = (n) => Array(n).fill('?').join(',');

// Gắn variants (version hiện tại), owner, reaction, số comment cho một danh sách photo row.
export function hydratePhotos(rows, viewerId) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const variants = db.prepare(`
    SELECT v.* FROM photo_variants v JOIN photos p ON p.id = v.photo_id AND p.current_version = v.version
    WHERE v.photo_id IN (${marks(ids.length)}) ORDER BY v.width`).all(...ids);
  const byPhoto = new Map();
  variants.forEach((v) => { if (!byPhoto.has(v.photo_id)) byPhoto.set(v.photo_id, []); byPhoto.get(v.photo_id).push(v); });

  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const owners = new Map(db.prepare(`SELECT * FROM users WHERE id IN (${marks(ownerIds.length)})`).all(...ownerIds).map((u) => [u.id, u]));

  const react = db.prepare(`SELECT photo_id, emoji, COUNT(*) c FROM reactions WHERE photo_id IN (${marks(ids.length)}) GROUP BY photo_id, emoji`).all(...ids);
  const mine = new Map(db.prepare(`SELECT photo_id, emoji FROM reactions WHERE user_id = ? AND photo_id IN (${marks(ids.length)})`).all(viewerId, ...ids).map((r) => [r.photo_id, r.emoji]));
  const counts = new Map();
  react.forEach((r) => { if (!counts.has(r.photo_id)) counts.set(r.photo_id, {}); counts.get(r.photo_id)[r.emoji] = r.c; });
  const cc = new Map(db.prepare(`SELECT photo_id, COUNT(*) c FROM comments WHERE photo_id IN (${marks(ids.length)}) GROUP BY photo_id`).all(...ids).map((r) => [r.photo_id, r.c]));

  return rows.map((r) => {
    const o = owners.get(r.owner_id);
    return {
      id: r.id, title: r.title, alt: r.alt || r.title || `Ảnh của ${o?.name || 'bạn bè'}`,
      aspect: r.aspect, width: r.width, height: r.height, slot: r.slot, version: r.current_version,
      createdAt: r.created_at, updatedAt: r.updated_at, edit: JSON.parse(r.edit), edited: r.edit !== r.base_edit,
      owner: o ? { id: o.id, name: o.name, avatarUrl: avatarUrl(o) } : null,
      variants: (byPhoto.get(r.id) || []).map((v) => ({ width: v.width, height: v.height, bytes: v.bytes, url: mediaUrl(v.storage_key) })),
      reactions: { counts: counts.get(r.id) || {}, mine: mine.get(r.id) || null },
      commentCount: cc.get(r.id) || 0,
    };
  });
}
