import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gal-"));
process.env.DB_PATH = path.join(tmp, "db.sqlite");
process.env.STORAGE_DRIVER = process.env.TEST_STORAGE || "local";
process.env.LOCAL_STORAGE_ROOT = path.join(tmp, "up");
process.env.AUTH_DEV = "1";
process.env.DEBUG_FAULTS = "1";
process.env.OLD_VERSION_TTL_MS = "0";
process.env.CLIENT_DIST = path.join(tmp, "nodist");

const { createStorage } = await import("../src/storage/index.js");
const { createApp } = await import("../src/app.js");
const { runCleanup } = await import("../src/photoService.js");
const { db } = await import("../src/db.js");
const { makeTestData } = await import("../scripts/make-test-data.mjs");

const storage = createStorage();
await storage.init();
const server = createApp(storage).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const F = await makeTestData(path.join(tmp, "td"));
after(() => {
  server.close();
});

async function login(email) {
  const r = await fetch(`${base}/api/auth/dev`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "gallery",
    },
    body: JSON.stringify({ email, name: email.split("@")[0] }),
  });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return (path, opts = {}) =>
    fetch(base + path, {
      ...opts,
      headers: {
        cookie,
        "x-requested-with": "gallery",
        ...(opts.headers || {}),
      },
    });
}
const jsonPost = (a, p, body, method = "POST") =>
  a(p, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const fileBlob = (p, type) => new Blob([fs.readFileSync(p)], { type });
function form(entries, meta) {
  const fd = new FormData();
  entries.forEach(([p, type]) =>
    fd.append("photos", fileBlob(p, type), path.basename(p)),
  );
  if (meta) fd.append("meta", JSON.stringify(meta));
  return fd;
}
const photoKeys = async () => await storage.list("photos/");

let alice, bob;
before(async () => {
  alice = await login("alice@gmail.com");
  bob = await login("bob@gmail.com");
});

test("upload JPEG + PNG: có Photo, PhotoVariant, file trong kho", async () => {
  const r = await alice("/api/photos?", {
    method: "POST",
    body: form(
      [
        [F.jpeg43, "image/jpeg"],
        [F.png11, "image/png"],
      ],
      [{ title: "Bờ biển", alt: "Biển lúc chiều" }, { title: "Vuông" }],
    ),
  });
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.deepEqual(
    results.map((x) => x.ok),
    [true, true],
  );
  assert.equal(results[0].photo.aspect, "4:3");
  assert.equal(results[1].photo.aspect, "1:1");
  assert.deepEqual(
    results[0].photo.variants.map((v) => v.width),
    [320, 960, 1200],
  );
  assert.deepEqual(
    results[1].photo.variants.map((v) => v.width),
    [320, 800],
  ); // không phóng lớn
  assert.equal(results[0].photo.alt, "Biển lúc chiều");
  const keys = await photoKeys();
  const dbKeys = db
    .prepare(`SELECT storage_key k FROM photo_variants`)
    .all()
    .map((x) => x.k);
  dbKeys.forEach((k) => assert.ok(keys.includes(k), k));
  assert.ok(!dbKeys.some((k) => k.startsWith("/")));
  assert.deepEqual([results[0].photo.slot, results[1].photo.slot], [0, 1]);
});

test("media: Content-Type + Cache-Control, original không công khai", async () => {
  const { photos } = await (await alice("/api/photos/mine")).json();
  const url = photos[0].variants[0].url;
  const r = await fetch(base + url);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/webp");
  assert.equal(
    r.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  const id = photos[0].id;
  assert.equal(
    (await fetch(`${base}/media/photos/${id}/original.webp`)).status,
    404,
  );
  assert.equal((await fetch(`${base}/media/photos/${id}/../../x`)).status, 404);
});

test("trộn file hợp lệ + file giả/hỏng/quá pixel/quá dung lượng: chỉ file hợp lệ được lưu", async () => {
  const before = (await photoKeys()).length;
  const r = await alice("/api/photos", {
    method: "POST",
    body: form([
      [F.fakeText, "image/jpeg"],
      [F.jpeg34, "image/jpeg"],
      [F.truncated, "image/jpeg"],
      [F.hugePixels, "image/png"],
      [F.tooLarge, "image/png"],
    ]),
  });
  assert.equal(r.status, 200);
  const { results } = await r.json();
  assert.deepEqual(
    results.map((x) => x.ok),
    [false, true, false, false, false],
  );
  assert.deepEqual(
    results.map((x) => x.error?.code),
    [
      "unsupported_type",
      undefined,
      "corrupt_image",
      "too_many_pixels",
      "file_too_large",
    ],
  );
  assert.deepEqual(
    results.map((x) => x.index),
    [0, 1, 2, 3, 4],
  );
  assert.equal((await photoKeys()).length - before, 3); // 1 original + 2 variant (320, 900) của ảnh hợp lệ duy nhất
});

test("tỉ lệ không hợp lệ bị từ chối; crop kèm theo thì được chấp nhận", async () => {
  let r = await alice("/api/photos", {
    method: "POST",
    body: form([[F.wide, "image/jpeg"]]),
  });
  assert.equal(r.status, 422);
  assert.equal((await r.json()).results[0].error.code, "aspect_not_allowed");
  // crop 4:3 ở giữa ảnh 16:9: w = (4/3*900)/1600 = 0.75, h = 1
  r = await alice("/api/photos", {
    method: "POST",
    body: form(
      [[F.wide, "image/jpeg"]],
      [{ edit: { crop: { x: 0.125, y: 0, w: 0.75, h: 1 } } }],
    ),
  });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  assert.equal(j.results[0].photo.aspect, "4:3");
});

test("quá 5 file -> 400, không công bố ảnh nào", async () => {
  const before = (await photoKeys()).length,
    rows = db.prepare("select count(*) c from photos").get().c;
  const r = await alice("/api/photos", {
    method: "POST",
    body: form(Array(6).fill([F.jpeg43, "image/jpeg"])),
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, "too_many_files");
  assert.equal((await photoKeys()).length, before);
  assert.equal(db.prepare("select count(*) c from photos").get().c, rows);
});

test("tổng request > 55 MiB -> 413", async () => {
  const fd = new FormData();
  for (let i = 0; i < 5; i++)
    fd.append(
      "photos",
      new Blob([Buffer.alloc(11 * 1024 * 1024, 1)], { type: "image/jpeg" }),
      `big${i}.jpg`,
    );
  try {
    const r = await alice("/api/photos", { method: "POST", body: fd });
    assert.equal(r.status, 413);
  } catch (e) {
    // Windows: server đóng kết nối ngay khi từ chối nên client có thể nhận ECONNRESET
    if (e?.cause?.code !== "ECONNRESET") throw e;
  }
});

test("EXIF: xoay theo orientation, bỏ GPS/EXIF khỏi mọi file công khai", async () => {
  const exifBefore = await sharp(F.exif).metadata();
  assert.equal(exifBefore.orientation, 6);
  assert.ok(exifBefore.exif);
  assert.ok(exifBefore.exif.length > 200); // có khối EXIF kèm GPS giả
  const r = await alice("/api/photos", {
    method: "POST",
    body: form([[F.exif, "image/jpeg"]]),
  });
  const p = (await r.json()).results[0].photo;
  assert.equal(p.aspect, "3:4");
  assert.equal(p.width, 600);
  assert.equal(p.height, 800);
  for (const v of p.variants) {
    const buf = Buffer.from(await (await fetch(base + v.url)).arrayBuffer());
    const m = await sharp(buf).metadata();
    assert.equal(m.exif, undefined);
    assert.equal(m.format, "webp");
  }
  const orig = await storage.get(`photos/${p.id}/original.webp`);
  const mo = await sharp(orig).metadata();
  assert.equal(mo.exif, undefined);
  assert.equal(mo.width, 600);
  // nửa trái (đỏ) trước xoay 90° CW -> nằm ở nửa trên
  const px = await sharp(orig).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => [
    ...px.data.subarray(
      (y * px.info.width + x) * px.info.channels,
      (y * px.info.width + x) * px.info.channels + 3,
    ),
  ];
  assert.ok(at(300, 100)[0] > 180 && at(300, 100)[2] < 120, "trên phải đỏ");
  assert.ok(at(300, 700)[2] > 180, "dưới phải xanh");
});

test("lỗi DB sau khi ghi file: không còn file mồ côi", async () => {
  const before = await photoKeys(),
    rows = db.prepare("select count(*) c from photos").get().c;
  const r = await alice("/api/photos?fail=db", {
    method: "POST",
    body: form([[F.jpeg43, "image/jpeg"]]),
  });
  assert.equal(r.status, 422);
  assert.deepEqual(await photoKeys(), before);
  assert.equal(db.prepare("select count(*) c from photos").get().c, rows);
  const r2 = await alice("/api/photos?fail=storage", {
    method: "POST",
    body: form([[F.jpeg43, "image/jpeg"]]),
  });
  assert.equal(r2.status, 422);
  assert.deepEqual(await photoKeys(), before);
});

test("chỉnh sửa: xoay/lật/filter/crop tạo version mới, khôi phục, từ chối thông số sai", async () => {
  const up = await (
    await alice("/api/photos", {
      method: "POST",
      body: form([[F.jpeg43, "image/jpeg"]]),
    })
  ).json();
  const p = up.results[0].photo;
  const edit = (body, q = "") =>
    jsonPost(alice, `/api/photos/${p.id}/edit${q}`, body);

  let r = await edit({
    baseVersion: 1,
    edit: { rotate: 90, flip: true, filter: "bw" },
  });
  assert.equal(r.status, 200);
  let j = (await r.json()).photo;
  assert.equal(j.version, 2);
  assert.equal(j.aspect, "3:4");
  assert.ok(j.variants[0].url.includes("/v2/"));
  assert.ok(
    (await storage.list(`photos/${p.id}/v1/`)).length > 0,
    "v1 chưa bị ghi đè/xóa ngay",
  );

  // sai: góc xoay, vùng crop ngoài ảnh, tỉ lệ sai, baseVersion cũ -> ảnh không đổi
  assert.equal(
    (await edit({ baseVersion: 2, edit: { rotate: 45 } })).status,
    400,
  );
  assert.equal(
    (
      await edit({
        baseVersion: 2,
        edit: { crop: { x: 0.5, y: 0, w: 0.9, h: 1 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await edit({
        baseVersion: 2,
        edit: { crop: { x: 0, y: 0, w: 0.5, h: 0.7 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (await edit({ baseVersion: 1, edit: { rotate: 90 } })).status,
    409,
  );
  assert.equal(
    (await (await alice(`/api/photos/${p.id}`)).json()).photo.version,
    2,
  );

  // crop 1:1 hợp lệ trên 3:4 (sau xoay: 900x1200): w=1, h=0.75
  r = await edit({
    baseVersion: 2,
    edit: { rotate: 90, flip: true, crop: { x: 0, y: 0, w: 1, h: 0.75 } },
  });
  assert.equal(r.status, 200);
  j = (await r.json()).photo;
  assert.equal(j.aspect, "1:1");
  assert.equal(j.version, 3);

  // lỗi DB khi sửa: giữ version cũ, không còn file v4
  r = await edit({ baseVersion: 3, edit: { rotate: 180 } }, "?fail=db");
  assert.equal(r.status, 500);
  assert.equal((await storage.list(`photos/${p.id}/v4/`)).length, 0);

  // khôi phục: bỏ qua mọi thông số trong request
  r = await edit({ baseVersion: 3, restore: true, edit: { rotate: 90 } });
  j = (await r.json()).photo;
  assert.equal(j.version, 4);
  assert.equal(j.aspect, "4:3");
  assert.equal(j.edited, false);

  // version cũ được dọn sau thời hạn (TTL=0 trong test)
  await runCleanup(storage);
  assert.equal((await storage.list(`photos/${p.id}/v1/`)).length, 0);
  assert.ok((await storage.list(`photos/${p.id}/v4/`)).length > 0);
});

test("reorder + xóa ảnh dọn sạch file và metadata", async () => {
  const { photos } = await (await alice("/api/photos/mine")).json();
  const [a, b] = photos;
  let r = await jsonPost(alice, "/api/photos/reorder", {
    moves: [
      { id: a.id, slot: b.slot },
      { id: b.id, slot: a.slot },
    ],
  });
  assert.equal(r.status, 200);
  const after = (await (await alice("/api/photos/mine")).json()).photos;
  assert.equal(after.find((x) => x.id === a.id).slot, b.slot);
  r = await jsonPost(alice, "/api/photos/reorder", {
    moves: [{ id: b.id, slot: b.slot }],
  }); // trùng ô (ô này đang của ảnh a)
  assert.equal(r.status, 409);
  assert.equal(
    (
      await jsonPost(bob, "/api/photos/reorder", {
        moves: [{ id: a.id, slot: 50 }],
      })
    ).status,
    400,
  ); // ảnh của người khác

  assert.equal(
    (await bob(`/api/photos/${a.id}`, { method: "DELETE" })).status,
    404,
  );
  r = await alice(`/api/photos/${a.id}`, { method: "DELETE" });
  assert.deepEqual(await r.json(), { ok: true, cleaned: true });
  assert.deepEqual(await storage.list(`photos/${a.id}/`), []);
  assert.equal(
    db.prepare("select count(*) c from photos where id = ?").get(a.id).c,
    0,
  );
  assert.equal((await fetch(base + a.variants[0].url)).status, 404);
});

test("bạn bè: lời mời bằng email, feed, album, reaction, bình luận, quyền truy cập", async () => {
  const { photos } = await (await alice("/api/photos/mine")).json();
  const pid = photos[0].id;
  assert.equal((await bob(`/api/photos/${pid}`)).status, 403); // chưa là bạn
  assert.equal((await bob("/api/albums/" + photos[0].owner.id)).status, 403);

  let r = await jsonPost(bob, "/api/friends/request", {
    email: "Alice@gmail.com",
  });
  assert.equal((await r.json()).status, "pending");
  assert.equal(
    (await jsonPost(bob, "/api/friends/request", { email: "alice@gmail.com" }))
      .status,
    409,
  );
  const inc = (await (await alice("/api/friends")).json()).incoming;
  assert.equal(inc.length, 1);
  assert.equal(
    (
      await alice(`/api/friends/requests/${inc[0].requestId}/accept`, {
        method: "POST",
      })
    ).status,
    200,
  );

  const feed = await (await bob("/api/feed")).json();
  assert.ok(
    feed.photos.length >= 1 &&
      feed.photos.every((p) => p.owner.name === "alice"),
  );
  const album = await (await bob("/api/albums/" + photos[0].owner.id)).json();
  assert.equal(album.isMine, false);
  assert.ok(album.startPage >= 0);

  r = await jsonPost(
    bob,
    `/api/photos/${pid}/reaction`,
    { emoji: "❤️" },
    "PUT",
  );
  assert.deepEqual((await r.json()).reactions, {
    counts: { "❤️": 1 },
    mine: "❤️",
  });
  r = await jsonPost(
    bob,
    `/api/photos/${pid}/reaction`,
    { emoji: "💩" },
    "PUT",
  );
  assert.equal(r.status, 400);
  r = await jsonPost(bob, `/api/photos/${pid}/comments`, {
    body: "  Đẹp quá!  ",
  });
  const c = (await r.json()).comment;
  assert.equal(c.body, "Đẹp quá!");
  assert.equal(
    (await jsonPost(bob, `/api/photos/${pid}/comments`, { body: "   " }))
      .status,
    400,
  );
  const dl = await bob(`/api/photos/${pid}/download`);
  assert.equal(dl.headers.get("content-type"), "image/jpeg");
  assert.match(dl.headers.get("content-disposition"), /attachment/);
  assert.equal(
    (await alice(`/api/comments/${c.id}`, { method: "DELETE" })).status,
    200,
  ); // chủ ảnh xóa được
});

test("CSRF header bắt buộc; chưa đăng nhập -> 401; restart không mất dữ liệu", async () => {
  assert.equal((await fetch(`${base}/api/me`)).status, 200);
  assert.equal((await fetch(`${base}/api/photos/mine`)).status, 401);
  const r = await fetch(`${base}/api/auth/logout`, { method: "POST" });
  assert.equal(r.status, 403);
  // "restart": tạo app mới trên cùng DB + kho
  const s2 = createApp(createStorage()).listen(0);
  const { photos } = await (await alice("/api/photos/mine")).json();
  const r2 = await fetch(
    `http://127.0.0.1:${s2.address().port}${photos[0].variants[0].url}`,
  );
  assert.equal(r2.status, 200);
  s2.close();
});

test("health: 200 khi kho sống, 503 khi kho lỗi, không cần đăng nhập", async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, storage: "up" });
  const down = {
    ping: async () => {
      throw new Error("boom");
    },
  };
  const s3 = createApp(down).listen(0);
  const r2 = await fetch(`http://127.0.0.1:${s3.address().port}/api/health`);
  assert.equal(r2.status, 503);
  assert.deepEqual(await r2.json(), { ok: false, storage: "down" });
  s3.close();
});

test("khởi động: kho chưa sẵn sàng thì thử lại, lỗi khác thì báo ngay", async () => {
  const { initWithRetry } = await import("../src/storage/index.js");
  const { S3Storage } = await import("../src/storage/s3.js");
  const mute = () => {};
  // Lỗi "chưa kết nối" 2 lần rồi thành công -> thử lại và thành công
  let n = 0;
  await initWithRetry(
    {
      init: async () => {
        if (++n < 3)
          throw Object.assign(new Error("x"), { code: "STORAGE_UNREACHABLE" });
      },
    },
    { delayMs: 1, log: mute },
  );
  assert.equal(n, 3);
  // Lỗi khác (sai khóa...) -> không thử lại
  let m = 0;
  await assert.rejects(
    initWithRetry(
      {
        init: async () => {
          m++;
          throw new Error("sai khóa");
        },
      },
      { delayMs: 1, log: mute },
    ),
    /sai khóa/,
  );
  assert.equal(m, 1);
  // Hết lượt thử thì ném lỗi
  await assert.rejects(
    initWithRetry(
      {
        init: async () => {
          throw Object.assign(new Error("x"), { code: "STORAGE_UNREACHABLE" });
        },
      },
      { tries: 2, delayMs: 1, log: mute },
    ),
    { code: "STORAGE_UNREACHABLE" },
  );
  // S3 thật nhưng cổng đóng: báo "không kết nối được", KHÔNG báo "bucket chưa tồn tại"
  const dead = new S3Storage({
    endpoint: "http://127.0.0.1:1",
    region: "us-east-1",
    bucket: "gallery",
    accessKeyId: "a",
    secretAccessKey: "b",
  });
  await assert.rejects(
    dead.init(),
    (e) =>
      e.code === "STORAGE_UNREACHABLE" && /Không kết nối được/.test(e.message),
  );
});
