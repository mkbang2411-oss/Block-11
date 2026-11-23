import { db, now } from './db.js';
import { config } from './config.js';
import { newId } from './ids.js';
import { normalizeOriginal, renderVersion, parseEdit, DEFAULT_EDIT, ImageError } from './image.js';

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const origKey = (id) => `photos/${id}/original.webp`;
const varKey = (id, v, w) => `photos/${id}/v${v}/${w}.webp`;

/* Xóa key đã ghi; nếu xóa lỗi thì LƯU key vào cleanup_queue để dọn lại sau (bù trừ, không phải transaction xuyên DB+storage). */
async function compensate(storage, keys) {
  for (const k of keys) {
    try { await storage.delete(k); }
    catch (e) {
      db.prepare(`INSERT OR REPLACE INTO cleanup_queue(storage_key, not_before, attempts, last_error) VALUES (?, ?, 0, ?)`)
        .run(k, now(), String(e.message).slice(0, 200));
    }
  }
}

const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function firstFreeSlot(ownerId) {
  const used = new Set(db.prepare(`SELECT slot FROM photos WHERE owner_id = ? AND status = 'published'`).all(ownerId).map((r) => r.slot));
  let s = 0; while (used.has(s)) s++;
  return s;
}

/* ---------- Tạo ảnh (slide 22): kiểm tra -> xử lý -> ghi file -> ghi DB (transaction) -> công bố ---------- */
export async function createPhoto({ storage, owner, buffer, title, alt, edit, faults = {} }) {
  const parsed = parseEdit(edit);
  const original = await normalizeOriginal(buffer);            // 1. kiểm tra + chuẩn hóa
  const rendered = await renderVersion(original.buf, parsed);  // 2. sinh variant (kiểm tra cả tỉ lệ)

  const id = newId('p_');
  const written = [];
  try {
    await storage.put(origKey(id), original.buf); written.push(origKey(id));   // 3. ghi đủ file trước
    for (const v of rendered.variants) {
      if (faults.storage && written.length >= 2) throw new Error('injected storage failure');
      await storage.put(varKey(id, 1, v.width), v.buf); written.push(varKey(id, 1, v.width));
    }
    const t = now();
    db.transaction(() => {                                                      //    rồi mới ghi metadata
      db.prepare(`INSERT INTO photos (id, owner_id, title, alt, aspect, width, height, slot, current_version, original_key, base_edit, edit, status, created_at, updated_at)
                  VALUES (@id, @owner, @title, @alt, @aspect, @width, @height, @slot, 1, @ok, @edit, @edit, 'published', @t, @t)`)
        .run({ id, owner: owner.id, title: cleanText(title, 120), alt: cleanText(alt, 300), aspect: rendered.aspect,
          width: rendered.width, height: rendered.height, slot: firstFreeSlot(owner.id), ok: origKey(id), edit: JSON.stringify(parsed), t });
      const ins = db.prepare(`INSERT INTO photo_variants (photo_id, version, width, height, mime, bytes, storage_key) VALUES (?,?,?,?,?,?,?)`);
      for (const v of rendered.variants) ins.run(id, 1, v.width, v.height, v.mime, v.bytes, varKey(id, 1, v.width));
      if (faults.db) throw new Error('injected db failure');                    // lỗi DB SAU khi đã ghi file
    })();
  } catch (e) {
    await compensate(storage, written);                                         // xóa file vừa ghi (hoặc xếp hàng dọn lại)
    throw e;
  }
  return id;                                                                    // 4. commit xong mới trả thành công
}

/* ---------- Chỉnh sửa (slide 39-41): luôn bắt đầu từ bản gốc đã chuẩn hóa, ghi version mới ---------- */
export async function editPhoto({ storage, photo, baseVersion, edit, restore, faults = {} }) {
  if (baseVersion !== photo.current_version) throw new HttpError(409, 'version_conflict', 'Ảnh vừa được chỉnh sửa ở nơi khác. Hãy mở lại ảnh.');
  const parsed = restore ? JSON.parse(photo.base_edit) : parseEdit(edit); // "Khôi phục" bỏ qua crop/xoay/lật trong request
  const orig = await storage.get(photo.original_key);
  if (!orig) throw new HttpError(500, 'original_missing', 'Không tìm thấy bản gốc của ảnh.');
  const rendered = await renderVersion(orig, parsed);

  const nv = photo.current_version + 1;
  const written = [];
  try {
    for (const v of rendered.variants) {
      if (faults.storage && written.length >= 1) throw new Error('injected storage failure');
      await storage.put(varKey(photo.id, nv, v.width), v.buf); written.push(varKey(photo.id, nv, v.width));
    }
    db.transaction(() => {
      const old = db.prepare(`SELECT storage_key FROM photo_variants WHERE photo_id = ? AND version = ?`).all(photo.id, photo.current_version);
      const ins = db.prepare(`INSERT INTO photo_variants (photo_id, version, width, height, mime, bytes, storage_key) VALUES (?,?,?,?,?,?,?)`);
      for (const v of rendered.variants) ins.run(photo.id, nv, v.width, v.height, v.mime, v.bytes, varKey(photo.id, nv, v.width));
      // Điều kiện current_version: hai lần sửa đồng thời -> chỉ một bên thắng
      const r = db.prepare(`UPDATE photos SET current_version = ?, aspect = ?, width = ?, height = ?, edit = ?, updated_at = ?
                            WHERE id = ? AND current_version = ? AND status = 'published'`)
        .run(nv, rendered.aspect, rendered.width, rendered.height, JSON.stringify(parsed), now(), photo.id, photo.current_version);
      if (r.changes !== 1) throw new HttpError(409, 'version_conflict', 'Ảnh vừa được chỉnh sửa ở nơi khác.');
      if (faults.db) throw new Error('injected db failure');
      // File version cũ KHÔNG bị ghi đè; xếp hàng xóa sau thời hạn (cache URL cũ còn dùng được một lúc)
      const q = db.prepare(`INSERT OR REPLACE INTO cleanup_queue(storage_key, not_before, attempts) VALUES (?, ?, 0)`);
      for (const o of old) q.run(o.storage_key, now() + config.cleanup.oldVersionTtlMs);
      db.prepare(`DELETE FROM photo_variants WHERE photo_id = ? AND version = ?`).run(photo.id, photo.current_version);
    })();
  } catch (e) {
    await compensate(storage, written);
    throw e;
  }
}

/* ---------- Xóa ảnh (slide 24): ẩn -> dọn file -> xóa metadata. Chạy lại được. ---------- */
export function markDeleting(photoId) {
  db.prepare(`UPDATE photos SET status = 'deleting', updated_at = ? WHERE id = ?`).run(now(), photoId);
}

export async function purgePhoto(storage, photoId) {
  const p = db.prepare(`SELECT original_key FROM photos WHERE id = ?`).get(photoId);
  if (!p) return true;
  const keys = [
    p.original_key,
    ...db.prepare(`SELECT storage_key FROM photo_variants WHERE photo_id = ?`).all(photoId).map((r) => r.storage_key),
    ...db.prepare(`SELECT storage_key FROM cleanup_queue WHERE storage_key LIKE ?`).all(`photos/${photoId}/%`).map((r) => r.storage_key), // version cũ chưa hết hạn
  ];
  let failed = 0;
  for (const k of keys) {
    try { await storage.delete(k); } catch (e) { failed++; console.error('[cleanup] không xóa được', k, e.message); }
  }
  if (failed) return false; // giữ metadata (status=deleting) để chạy lại
  db.transaction(() => {
    // cũng dọn key version cũ còn chờ trong queue của ảnh này
    db.prepare(`DELETE FROM cleanup_queue WHERE storage_key LIKE ?`).run(`photos/${photoId}/%`);
    db.prepare(`DELETE FROM photos WHERE id = ?`).run(photoId); // cascade: variants, reactions, comments
  })();
  return true;
}

/* ---------- Worker dọn dẹp: chạy lúc khởi động và định kỳ ---------- */
export async function runCleanup(storage) {
  let done = 0;
  for (const { id } of db.prepare(`SELECT id FROM photos WHERE status = 'deleting'`).all()) {
    if (await purgePhoto(storage, id)) done++;
  }
  for (const q of db.prepare(`SELECT storage_key FROM cleanup_queue WHERE not_before <= ?`).all(now())) {
    try { await storage.delete(q.storage_key); db.prepare(`DELETE FROM cleanup_queue WHERE storage_key = ?`).run(q.storage_key); done++; }
    catch (e) { db.prepare(`UPDATE cleanup_queue SET attempts = attempts + 1, last_error = ? WHERE storage_key = ?`).run(String(e.message).slice(0, 200), q.storage_key); }
  }
  return done;
}

export { ImageError, DEFAULT_EDIT };
