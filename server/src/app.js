import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { db, now } from './db.js';
import { config } from './config.js';
import { loadUser, requireAuth, issueSession, clearSession, upsertUser, verifyGoogleCredential } from './auth.js';
import { friendIdsOf, areFriends } from './friends.js';
import { hydratePhotos, publicUser, avatarUrl } from './serialize.js';
import { parseMultipart, limitsFor } from './upload.js';
import { HttpError, createPhoto, editPhoto, markDeleting, purgePhoto, ImageError } from './photoService.js';
import { renderAvatar, toJpeg } from './image.js';
import { isValidKey } from './storage/keys.js';
import { newId } from './ids.js';

const EMOJIS = ['❤️', '😆', '😮', '🥹', '🔥', '✨'];
const L = config.limits;
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function errorBody(e) {
  if (e instanceof ImageError || e instanceof HttpError) return { code: e.code, message: e.message };
  console.error('[error]', e);
  return { code: 'internal_error', message: 'Có lỗi khi xử lý ảnh. Vui lòng thử lại.' };
}

export function createApp(storage) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
        frameSrc: ['https://accounts.google.com/gsi/'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null, // cho phép chạy http://localhost; bật lại khi đặt sau HTTPS proxy
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // popup đăng nhập Google cần cái này
    crossOriginResourcePolicy: { policy: 'same-site' },
    // Camera cần permissions policy cho phép chính trang này
  }));
  app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(self)'); next(); });
  app.use(cookieParser());
  app.use(loadUser);

  /* ---------------- Media (phân phối ảnh từ origin) ---------------- */
  app.get('/media/*', wrap(async (req, res) => {
    const key = req.params[0];
    if (!isValidKey(key) || key.endsWith('/original.webp')) return res.status(404).end();
    const obj = await storage.stream(key);
    if (!obj) return res.status(404).end();
    res.set({
      'Content-Type': 'image/webp',
      // URL có chứa version/id nên nội dung không đổi -> cache dùng chung 1 năm
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    if (obj.size != null) res.set('Content-Length', String(obj.size));
    obj.body.on('error', () => res.destroy());
    obj.body.pipe(res);
  }));

  /* ---------------- API ---------------- */
  const api = express.Router();
  api.use((req, res, next) => { // CSRF: yêu cầu header tùy biến cho mọi request ghi
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-requested-with') !== 'gallery') {
      return res.status(403).json({ error: { code: 'csrf', message: 'Thiếu header X-Requested-With.' } });
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/config', (_req, res) => res.json({
    googleClientId: config.googleClientId || null, devLogin: config.authDev, emojis: EMOJIS,
    limits: { maxFiles: L.maxFiles, maxFileBytes: L.maxFileBytes, maxRequestBytes: L.maxRequestBytes, maxPixels: L.maxPixels, slotsPerPage: L.slotsPerPage },
  }));

  /* ----- Auth ----- */
  api.post('/auth/google', express.json({ limit: '20kb' }), wrap(async (req, res) => {
    let profile;
    try { profile = await verifyGoogleCredential(String(req.body?.credential || '')); }
    catch (e) { return res.status(401).json({ error: { code: 'google_auth_failed', message: 'Đăng nhập Google không thành công.' } }); }
    const u = upsertUser(profile);
    issueSession(res, u.id);
    res.json({ user: publicUser(u) });
  }));
  api.post('/auth/dev', express.json({ limit: '5kb' }), (req, res) => {
    if (!config.authDev) return res.status(404).end();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: { code: 'bad_email', message: 'Email không hợp lệ.' } });
    const u = upsertUser({ email, name: clean(req.body?.name, 60) || email.split('@')[0] });
    issueSession(res, u.id);
    res.json({ user: publicUser(u) });
  });
  api.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });
  api.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

  api.patch('/me', requireAuth, express.json({ limit: '5kb' }), (req, res) => {
    const name = clean(req.body?.name, 60);
    if (!name) return res.status(400).json({ error: { code: 'bad_name', message: 'Tên không được để trống.' } });
    db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(name, req.user.id);
    res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
  });

  api.post('/me/avatar', requireAuth, wrap(async (req, res) => {
    const { files } = await parseMultipart(req, { fileField: 'avatar', maxFiles: 1, maxFileBytes: L.avatarMaxBytes, maxRequestBytes: L.avatarMaxBytes + 65536 });
    const f = files[0];
    if (!f || f.truncated) throw new HttpError(400, 'bad_avatar', 'Hãy chọn một ảnh avatar nhỏ hơn 4 MiB.');
    const webp = await renderAvatar(f.buffer);
    const key = `avatars/${req.user.id}/${Date.now()}.webp`;
    await storage.put(key, webp);
    const old = req.user.avatar_key;
    try {
      db.transaction(() => {
        db.prepare(`UPDATE users SET avatar_key = ? WHERE id = ?`).run(key, req.user.id);
        if (old) db.prepare(`INSERT OR REPLACE INTO cleanup_queue(storage_key, not_before) VALUES (?, ?)`).run(old, now() + config.cleanup.oldVersionTtlMs);
      })();
    } catch (e) { await storage.delete(key).catch(() => {}); throw e; }
    res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
  }));
  api.delete('/me/avatar', requireAuth, (req, res) => {
    const old = req.user.avatar_key;
    db.transaction(() => {
      db.prepare(`UPDATE users SET avatar_key = NULL WHERE id = ?`).run(req.user.id);
      if (old) db.prepare(`INSERT OR REPLACE INTO cleanup_queue(storage_key, not_before) VALUES (?, ?)`).run(old, now() + config.cleanup.oldVersionTtlMs);
    })();
    res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id)) });
  });

  /* ----- Bạn bè (kết bạn bằng địa chỉ Gmail) ----- */
  api.get('/friends', requireAuth, (req, res) => {
    const me = req.user;
    const ids = friendIdsOf(me);
    const friends = ids.length
      ? db.prepare(`SELECT u.*, (SELECT MAX(created_at) FROM photos p WHERE p.owner_id = u.id AND p.status = 'published') AS latest
                    FROM users u WHERE u.id IN (${ids.map(() => '?').join(',')}) ORDER BY latest IS NULL, latest DESC, u.name`).all(...ids)
      : [];
    const incoming = db.prepare(`SELECT u.*, fr.id AS rid, fr.created_at AS rcreated FROM friend_requests fr JOIN users u ON u.id = fr.from_id
                                 WHERE fr.to_email = ? AND fr.status = 'pending' ORDER BY fr.id DESC`).all(me.email);
    const outgoing = db.prepare(`SELECT id, to_email, created_at FROM friend_requests WHERE from_id = ? AND status = 'pending' ORDER BY id DESC`).all(me.id);
    res.json({
      friends: friends.map((u) => ({ ...publicUser(u), latestPhotoAt: u.latest })),
      incoming: incoming.map((r) => ({ requestId: r.rid, createdAt: r.rcreated, from: publicUser(r) })),
      outgoing: outgoing.map((r) => ({ requestId: r.id, email: r.to_email, createdAt: r.created_at })),
    });
  });

  api.post('/friends/request', requireAuth, express.json({ limit: '5kb' }), (req, res) => {
    const me = req.user;
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: { code: 'bad_email', message: 'Địa chỉ email không hợp lệ.' } });
    if (email === me.email) return res.status(400).json({ error: { code: 'self', message: 'Đây là email của bạn.' } });
    const target = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (target && areFriends(me, target.id)) return res.status(409).json({ error: { code: 'already_friends', message: 'Hai bạn đã là bạn bè.' } });
    if (db.prepare(`SELECT 1 FROM friend_requests WHERE from_id = ? AND to_email = ?`).get(me.id, email)) {
      return res.status(409).json({ error: { code: 'already_requested', message: 'Bạn đã gửi lời mời cho email này.' } });
    }
    // Họ đã mời mình trước -> kết bạn luôn
    const reverse = target && db.prepare(`SELECT id FROM friend_requests WHERE from_id = ? AND to_email = ? AND status = 'pending'`).get(target.id, me.email);
    if (reverse) {
      db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(reverse.id);
      return res.json({ status: 'accepted', friend: publicUser(target) });
    }
    db.prepare(`INSERT INTO friend_requests (from_id, to_email, status, created_at) VALUES (?,?, 'pending', ?)`).run(me.id, email, now());
    res.json({ status: 'pending', registered: !!target });
  });
  api.post('/friends/requests/:id/accept', requireAuth, (req, res) => {
    const r = db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ? AND to_email = ? AND status = 'pending'`).run(req.params.id, req.user.email);
    if (!r.changes) return res.status(404).json({ error: { code: 'not_found', message: 'Không tìm thấy lời mời.' } });
    res.json({ ok: true });
  });
  api.delete('/friends/requests/:id', requireAuth, (req, res) => { // từ chối hoặc hủy lời mời
    db.prepare(`DELETE FROM friend_requests WHERE id = ? AND status = 'pending' AND (from_id = ? OR to_email = ?)`).run(req.params.id, req.user.id, req.user.email);
    res.json({ ok: true });
  });
  api.delete('/friends/:userId', requireAuth, (req, res) => {
    const other = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.userId);
    if (other) db.prepare(`DELETE FROM friend_requests WHERE status = 'accepted' AND ((from_id = ? AND to_email = ?) OR (from_id = ? AND to_email = ?))`)
      .run(req.user.id, other.email, other.id, req.user.email);
    res.json({ ok: true });
  });

  /* ----- Ảnh: upload ----- */
  api.post('/photos', requireAuth, wrap(async (req, res) => {
    try {
      const { fields, files } = await parseMultipart(req, { fileField: 'photos', ...limitsFor() });
      if (!files.length) throw new HttpError(400, 'no_files', 'Hãy chọn từ 1 đến 5 ảnh.');
      let meta = [];
      if (fields.meta) {
        try { meta = JSON.parse(fields.meta); if (!Array.isArray(meta)) throw 0; }
        catch { throw new HttpError(400, 'invalid_meta', 'Trường meta phải là JSON mảng.'); }
      }
      const faults = config.debugFaults ? { db: req.query.fail === 'db', storage: req.query.fail === 'storage' } : {};
      const results = [];
      for (let i = 0; i < files.length; i++) { // mỗi file một kết quả riêng, gắn với index trong request
        const f = files[i]; const m = meta[i] && typeof meta[i] === 'object' ? meta[i] : {};
        const base = { index: i, filename: clean(f.filename, 120) };
        if (f.truncated) { results.push({ ...base, ok: false, error: { code: 'file_too_large', message: `File vượt ${L.maxFileBytes / 1048576} MiB.` } }); continue; }
        if (!f.buffer.length) { results.push({ ...base, ok: false, error: { code: 'empty_file', message: 'File rỗng.' } }); continue; }
        try {
          const id = await createPhoto({ storage, owner: req.user, buffer: f.buffer, title: m.title ?? fields.title, alt: m.alt ?? fields.alt, edit: m.edit, faults });
          const row = db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id);
          results.push({ ...base, ok: true, photo: hydratePhotos([row], req.user.id)[0] });
        } catch (e) { results.push({ ...base, ok: false, error: errorBody(e) }); }
      }
      res.status(results.some((r) => r.ok) ? 200 : 422).json({ results });
    } catch (e) { // lỗi cấp request: không công bố ảnh nào
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 413) res.set('Connection', 'close');
      res.status(status).json({ error: errorBody(e) });
    }
  }));

  /* ----- Ảnh: đọc ----- */
  const photoRow = (id) => db.prepare(`SELECT * FROM photos WHERE id = ? AND status = 'published'`).get(id);
  function viewablePhoto(req, id) {
    const p = photoRow(id);
    if (!p) throw new HttpError(404, 'not_found', 'Không tìm thấy ảnh.');
    if (!areFriends(req.user, p.owner_id)) throw new HttpError(403, 'forbidden', 'Chỉ bạn bè mới xem được ảnh này.');
    return p;
  }
  function ownedPhoto(req, id) {
    const p = photoRow(id);
    if (!p || p.owner_id !== req.user.id) throw new HttpError(404, 'not_found', 'Không tìm thấy ảnh.');
    return p;
  }

  api.get('/photos/mine', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT * FROM photos WHERE owner_id = ? AND status = 'published' ORDER BY slot`).all(req.user.id);
    res.json({ photos: hydratePhotos(rows, req.user.id) });
  });

  api.get('/feed', requireAuth, (req, res) => {
    const ids = [req.user.id, ...friendIdsOf(req.user)];
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
    let cursor = ''; const params = [...ids];
    if (req.query.before) {
      const [t, id] = String(req.query.before).split('_');
      if (Number.isFinite(+t) && id) { cursor = 'AND (created_at < ? OR (created_at = ? AND id < ?))'; params.push(+t, +t, id); }
    }
    const rows = db.prepare(`SELECT * FROM photos WHERE status = 'published' AND owner_id IN (${ids.map(() => '?').join(',')}) ${cursor}
                             ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, limit + 1);
    const more = rows.length > limit; const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    res.json({ photos: hydratePhotos(page, req.user.id), next: more && last ? `${last.created_at}_${last.id}` : null });
  });

  api.get('/albums/:userId', requireAuth, (req, res) => {
    const id = req.params.userId === 'me' ? req.user.id : req.params.userId;
    const owner = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
    if (!owner) throw new HttpError(404, 'not_found', 'Không tìm thấy người dùng.');
    if (!areFriends(req.user, owner.id)) throw new HttpError(403, 'forbidden', 'Chỉ bạn bè mới xem được album này.');
    const rows = db.prepare(`SELECT * FROM photos WHERE owner_id = ? AND status = 'published' ORDER BY slot`).all(owner.id);
    const newest = rows.reduce((a, r) => (!a || r.created_at > a.created_at ? r : a), null);
    res.json({
      owner: publicUser(owner), isMine: owner.id === req.user.id, photos: hydratePhotos(rows, req.user.id),
      startPage: newest ? Math.floor(newest.slot / L.slotsPerPage) : 0, // album mở ở trang chứa ảnh đăng gần nhất
    });
  });

  api.post('/photos/reorder', requireAuth, express.json({ limit: '50kb' }), (req, res) => {
    const moves = req.body?.moves;
    if (!Array.isArray(moves) || !moves.length || moves.length > 50) throw new HttpError(400, 'bad_moves', 'Danh sách di chuyển không hợp lệ.');
    const cur = new Map(db.prepare(`SELECT id, slot FROM photos WHERE owner_id = ? AND status = 'published'`).all(req.user.id).map((r) => [r.id, r.slot]));
    const next = new Map(cur);
    for (const m of moves) {
      if (!cur.has(m?.id) || !Number.isInteger(m.slot) || m.slot < 0 || m.slot > L.maxSlot) throw new HttpError(400, 'bad_moves', 'Di chuyển không hợp lệ.');
      next.set(m.id, m.slot);
    }
    if (new Set(next.values()).size !== next.size) throw new HttpError(409, 'slot_conflict', 'Hai ảnh không thể cùng một ô.');
    db.transaction(() => { const st = db.prepare(`UPDATE photos SET slot = ? WHERE id = ?`); for (const m of moves) st.run(m.slot, m.id); })();
    res.json({ ok: true });
  });

  api.get('/photos/:id', requireAuth, (req, res) => {
    const p = viewablePhoto(req, req.params.id);
    const reactors = db.prepare(`SELECT r.emoji, u.id, u.name FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.photo_id = ? ORDER BY r.created_at DESC LIMIT 30`).all(p.id);
    res.json({ photo: hydratePhotos([p], req.user.id)[0], reactors });
  });

  api.patch('/photos/:id', requireAuth, express.json({ limit: '10kb' }), (req, res) => {
    const p = ownedPhoto(req, req.params.id);
    const title = req.body?.title !== undefined ? clean(req.body.title, 120) : p.title;
    const alt = req.body?.alt !== undefined ? clean(req.body.alt, 300) : p.alt;
    db.prepare(`UPDATE photos SET title = ?, alt = ?, updated_at = ? WHERE id = ?`).run(title, alt, now(), p.id);
    res.json({ photo: hydratePhotos([photoRow(p.id)], req.user.id)[0] });
  });

  api.post('/photos/:id/edit', requireAuth, express.json({ limit: '10kb' }), wrap(async (req, res) => {
    const p = ownedPhoto(req, req.params.id);
    const faults = config.debugFaults ? { db: req.query.fail === 'db', storage: req.query.fail === 'storage' } : {};
    try {
      await editPhoto({ storage, photo: p, baseVersion: req.body?.baseVersion, edit: req.body?.edit, restore: req.body?.restore === true, faults });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof ImageError ? 400 : 500;
      return res.status(status).json({ error: errorBody(e) }); // request lỗi không đổi ảnh đã công bố
    }
    res.json({ photo: hydratePhotos([photoRow(p.id)], req.user.id)[0] });
  }));

  api.delete('/photos/:id', requireAuth, wrap(async (req, res) => {
    const p = ownedPhoto(req, req.params.id);
    markDeleting(p.id);                                   // 1. ẩn
    const cleaned = await purgePhoto(storage, p.id);      // 2. dọn file  3. xóa metadata
    res.json({ ok: true, cleaned }); // cleaned=false -> sẽ được worker dọn lại
  }));

  api.get('/photos/:id/original', requireAuth, wrap(async (req, res) => { // nguồn cho trình chỉnh sửa (chỉ chủ ảnh)
    const p = ownedPhoto(req, req.params.id);
    const obj = await storage.stream(p.original_key);
    if (!obj) throw new HttpError(404, 'not_found', 'Không tìm thấy bản gốc.');
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    obj.body.pipe(res);
  }));

  api.get('/photos/:id/download', requireAuth, wrap(async (req, res) => {
    const p = viewablePhoto(req, req.params.id);
    const v = db.prepare(`SELECT storage_key FROM photo_variants WHERE photo_id = ? AND version = ? ORDER BY width DESC LIMIT 1`).get(p.id, p.current_version);
    const buf = v && await storage.get(v.storage_key);
    if (!buf) throw new HttpError(404, 'not_found', 'Không tìm thấy file ảnh.');
    const name = (p.title || 'khoanh-khac').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'khoanh-khac';
    res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${name}.jpg"`, 'Cache-Control': 'private, no-store' });
    res.send(await toJpeg(buf));
  }));

  /* ----- Reaction & bình luận ----- */
  const reactionSummary = (photoId, uid) => {
    const counts = {}; db.prepare(`SELECT emoji, COUNT(*) c FROM reactions WHERE photo_id = ? GROUP BY emoji`).all(photoId).forEach((r) => { counts[r.emoji] = r.c; });
    const mine = db.prepare(`SELECT emoji FROM reactions WHERE photo_id = ? AND user_id = ?`).get(photoId, uid)?.emoji || null;
    return { counts, mine };
  };
  api.put('/photos/:id/reaction', requireAuth, express.json({ limit: '2kb' }), (req, res) => {
    const p = viewablePhoto(req, req.params.id);
    const emoji = req.body?.emoji;
    if (!EMOJIS.includes(emoji)) throw new HttpError(400, 'bad_emoji', 'Emoji không được hỗ trợ.');
    const cur = db.prepare(`SELECT emoji FROM reactions WHERE photo_id = ? AND user_id = ?`).get(p.id, req.user.id);
    if (cur?.emoji === emoji) db.prepare(`DELETE FROM reactions WHERE photo_id = ? AND user_id = ?`).run(p.id, req.user.id); // bấm lại = bỏ
    else db.prepare(`INSERT OR REPLACE INTO reactions (photo_id, user_id, emoji, created_at) VALUES (?,?,?,?)`).run(p.id, req.user.id, emoji, now());
    res.json({ reactions: reactionSummary(p.id, req.user.id) });
  });

  const commentOut = (c, me, ownerId) => ({
    id: c.id, body: c.body, createdAt: c.created_at,
    author: { id: c.uid, name: c.name, avatarUrl: avatarUrl(c) }, canDelete: c.uid === me.id || ownerId === me.id,
  });
  api.get('/photos/:id/comments', requireAuth, (req, res) => {
    const p = viewablePhoto(req, req.params.id);
    const rows = db.prepare(`SELECT c.id, c.body, c.created_at, u.id uid, u.name, u.avatar_key, u.google_picture FROM comments c JOIN users u ON u.id = c.user_id WHERE c.photo_id = ? ORDER BY c.id`).all(p.id);
    res.json({ comments: rows.map((c) => commentOut(c, req.user, p.owner_id)) });
  });
  api.post('/photos/:id/comments', requireAuth, express.json({ limit: '5kb' }), (req, res) => {
    const p = viewablePhoto(req, req.params.id);
    const body = clean(req.body?.body, 500);
    if (!body) throw new HttpError(400, 'empty_comment', 'Bình luận đang trống.');
    const r = db.prepare(`INSERT INTO comments (photo_id, user_id, body, created_at) VALUES (?,?,?,?)`).run(p.id, req.user.id, body, now());
    const c = db.prepare(`SELECT c.id, c.body, c.created_at, u.id uid, u.name, u.avatar_key, u.google_picture FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(r.lastInsertRowid);
    res.json({ comment: commentOut(c, req.user, p.owner_id) });
  });
  api.delete('/comments/:id', requireAuth, (req, res) => {
    const c = db.prepare(`SELECT c.*, p.owner_id FROM comments c JOIN photos p ON p.id = c.photo_id WHERE c.id = ?`).get(req.params.id);
    if (!c || (c.user_id !== req.user.id && c.owner_id !== req.user.id)) throw new HttpError(404, 'not_found', 'Không tìm thấy bình luận.');
    db.prepare(`DELETE FROM comments WHERE id = ?`).run(c.id);
    res.json({ ok: true });
  });

  api.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Không tìm thấy.' } }));
  api.use((err, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : err instanceof ImageError ? 400 : err.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: errorBody(err) });
  });
  app.use('/api', api);

  /* ----- Client (CSR) build ----- */
  const dist = path.resolve(config.clientDist);
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}
