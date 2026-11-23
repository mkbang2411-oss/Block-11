import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { db, now } from './db.js';
import { config } from './config.js';
import { newId } from './ids.js';

const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;
const COOKIE = 'sid';

export function issueSession(res, userId) {
  const token = jwt.sign({ uid: userId }, config.sessionSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 30 * 24 * 3600 * 1000, path: '/' });
}
export const clearSession = (res) => res.clearCookie(COOKIE, { path: '/' });

export function loadUser(req, _res, next) {
  req.user = null;
  const t = req.cookies?.[COOKIE];
  if (t) {
    try {
      const { uid } = jwt.verify(t, config.sessionSecret);
      req.user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(uid) || null;
    } catch { /* token hết hạn/sai -> coi như chưa đăng nhập */ }
  }
  next();
}
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: { code: 'unauthenticated', message: 'Bạn cần đăng nhập.' } });
  next();
}

export function upsertUser({ sub, email, name, picture }) {
  email = email.toLowerCase();
  let u = (sub && db.prepare(`SELECT * FROM users WHERE google_sub = ?`).get(sub)) || db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
  if (u) {
    db.prepare(`UPDATE users SET google_sub = COALESCE(google_sub, ?), google_picture = ? WHERE id = ?`).run(sub || null, picture || null, u.id);
    return db.prepare(`SELECT * FROM users WHERE id = ?`).get(u.id);
  }
  const id = newId('u_');
  db.prepare(`INSERT INTO users (id, google_sub, email, name, google_picture, created_at) VALUES (?,?,?,?,?,?)`)
    .run(id, sub || null, email, (name || email.split('@')[0]).slice(0, 60), picture || null, now());
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
}

// Xác minh ID token do Google Identity Services cấp (phía server, không tin client).
export async function verifyGoogleCredential(credential) {
  if (!google) throw new Error('Server chưa cấu hình GOOGLE_CLIENT_ID.');
  const ticket = await google.verifyIdToken({ idToken: credential, audience: config.googleClientId });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw new Error('Email Google chưa được xác minh.');
  return { sub: p.sub, email: p.email, name: p.name, picture: p.picture };
}
