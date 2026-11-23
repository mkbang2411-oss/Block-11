import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gal-'));
process.env.DB_PATH = path.join(tmp, 'db.sqlite');
process.env.STORAGE_DRIVER = process.env.TEST_STORAGE || 'local';
process.env.LOCAL_STORAGE_ROOT = path.join(tmp, 'up');
process.env.AUTH_DEV = '1';
process.env.DEBUG_FAULTS = '1';
process.env.OLD_VERSION_TTL_MS = '0';
process.env.CLIENT_DIST = path.join(tmp, 'nodist');

const { createStorage } = await import('../src/storage/index.js');
const { createApp } = await import('../src/app.js');
const { runCleanup } = await import('../src/photoService.js');
const { db } = await import('../src/db.js');
const { makeTestData } = await import('../scripts/make-test-data.mjs');

const storage = createStorage(); await storage.init();
const server = createApp(storage).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const F = await makeTestData(path.join(tmp, 'td'));
after(() => { server.close(); });

async function login(email) {
  const r = await fetch(`${base}/api/auth/dev`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'gallery' }, body: JSON.stringify({ email, name: email.split('@')[0] }) });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  return (path, opts = {}) => fetch(base + path, { ...opts, headers: { cookie, 'x-requested-with': 'gallery', ...(opts.headers || {}) } });
}
const jsonPost = (a, p, body, method = 'POST') => a(p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const fileBlob = (p, type) => new Blob([fs.readFileSync(p)], { type });
function form(entries, meta) {
  const fd = new FormData();
  entries.forEach(([p, type]) => fd.append('photos', fileBlob(p, type), path.basename(p)));
  if (meta) fd.append('meta', JSON.stringify(meta));
  return fd;
}
const photoKeys = async () => (await storage.list('photos/'));


let alice, bob;
before(async () => { alice = await login('alice2@gmail.com'); bob = await login('bob2@gmail.com'); });

test('nhật ký hoạt động + thông báo chia theo loại', async () => {
  // kết bạn
  await jsonPost(alice, '/api/friends/request', { email: 'bob2@gmail.com' });
  const f = await (await bob('/api/friends')).json();
  await bob(`/api/friends/requests/${f.incoming[0].requestId}/accept`, { method: 'POST' });
  // alice đăng ảnh, bob thả cảm xúc + bình luận
  const up = await (await alice('/api/photos', { method: 'POST', body: form([[F.jpeg43, 'image/jpeg']], [{ title: 'Biển' }]) })).json();
  const pid = up.results[0].photo.id;
  await (await bob(`/api/photos/${pid}/reaction`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: '🔥' }) })).json();
  await jsonPost(bob, `/api/photos/${pid}/comments`, { body: 'Đẹp quá' });
  await jsonPost(alice, '/api/me', { name: 'Alice Mới' }, 'PATCH');

  // thông báo của alice: tách đúng loại, có đếm chưa đọc theo loại
  const all = await (await alice('/api/notifications')).json();
  assert.equal(all.unreadByKind.comment, 1); assert.equal(all.unreadByKind.reaction, 1);
  const cm = await (await alice('/api/notifications?kind=comment')).json();
  assert.deepEqual(cm.items.map((x) => x.type), ['comment']);
  const re = await (await alice('/api/notifications?kind=reaction')).json();
  assert.deepEqual(re.items.map((x) => x.type), ['reaction']);
  // đọc riêng từng loại
  const rd = await (await alice('/api/notifications/read-all?kind=comment', { method: 'POST' })).json();
  assert.equal(rd.unreadByKind.comment, 0); assert.equal(rd.unreadByKind.reaction, 1);

  // nhật ký của bob: thả cảm xúc, bình luận, kết bạn; không thấy hoạt động của alice
  const act = await (await bob('/api/activity')).json();
  assert.deepEqual(act.items.map((x) => x.type), ['comment', 'react', 'friend_added']);
  assert.equal(act.items[0].photo.ownerName.length > 0, true); assert.equal(act.items[0].photo.mine, false);
  const soc = await (await bob('/api/activity?kind=social')).json();
  assert.equal(soc.items.length, 2);
  const aa = await (await alice('/api/activity')).json();
  assert.deepEqual(aa.items.map((x) => x.type), ['rename', 'photo_upload', 'friend_request']);
  // xóa ảnh -> vẫn còn dòng "đã xóa", ảnh không còn thumb
  await alice(`/api/photos/${pid}`, { method: 'DELETE' });
  const aa2 = await (await alice('/api/activity')).json();
  assert.equal(aa2.items[0].type, 'photo_delete');
  assert.equal(aa2.items.find((x) => x.type === 'photo_upload').photo, null);
  // phân trang
  const pg = await (await alice('/api/activity?before=' + aa2.items[0].id)).json();
  assert.ok(pg.items.every((x) => x.id < aa2.items[0].id));
});
