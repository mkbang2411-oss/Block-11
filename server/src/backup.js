import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

// Sao lưu = (1) ảnh chụp SQLite + (2) bản sao các file trong kho (qua API của kho, không chép thẳng
// thư mục dữ liệu của weed nên không lo chép giữa chừng khi weed đang ghi).
//
//   <dir>/db/gallery-<thời gian>.db   mỗi lần một bản, giữ `keep` bản mới nhất
//   <dir>/files/<key>                 bản sao kho: chỉ chép file CHƯA có, không bao giờ xóa
//                                     (ảnh lỡ xóa nhầm trong kho vẫn còn ở đây)
//
// Key ảnh chứa photoId + version nên nội dung của một key không đổi -> bỏ qua key đã có là đủ.

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

export async function backupAll({ db, storage, dir, keep = 14, log = console.log }) {
  const root = path.resolve(dir);
  await fsp.mkdir(path.join(root, "db"), { recursive: true });
  await fsp.mkdir(path.join(root, "files"), { recursive: true });

  // 1) DB: backup() của SQLite cho bản nhất quán kể cả khi server đang ghi (chế độ WAL).
  const dbFile = path.join(root, "db", `gallery-${stamp()}.db`);
  await db.backup(dbFile);
  log(`[backup] DB -> ${dbFile}`);

  // 2) File trong kho
  const keys = await storage.list("");
  let copied = 0;
  for (const key of keys) {
    const dest = path.join(root, "files", ...key.split("/"));
    if (fs.existsSync(dest)) continue;
    const buf = await storage.get(key);
    if (buf === null) continue; // vừa bị xóa giữa chừng
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp`;
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, dest);
    copied++;
  }
  log(`[backup] kho: ${keys.length} file, chép mới ${copied}`);

  // 3) Giữ `keep` bản DB mới nhất
  const dbs = (await fsp.readdir(path.join(root, "db"))).filter((f) => f.endsWith(".db")).sort();
  for (const old of dbs.slice(0, Math.max(0, dbs.length - keep)))
    await fsp.unlink(path.join(root, "db", old));

  return { dbFile, files: keys.length, copied };
}

// Khôi phục: chép lại DB (bản mới nhất hoặc bản chỉ định) và đẩy file lên kho nếu kho chưa có.
export async function restoreAll({ storage, dir, dbPath, dbName, force = false, log = console.log }) {
  const root = path.resolve(dir);
  const dbs = (await fsp.readdir(path.join(root, "db"))).filter((f) => f.endsWith(".db")).sort();
  if (!dbs.length) throw new Error(`Không có bản sao lưu DB nào trong ${root}${path.sep}db`);
  const pick = dbName || dbs[dbs.length - 1];
  if (!dbs.includes(pick)) throw new Error(`Không thấy bản DB "${pick}". Có: ${dbs.join(", ")}`);

  const target = path.resolve(dbPath);
  if (fs.existsSync(target) && !force)
    throw new Error(`${target} đã tồn tại. Dừng server, rồi chạy lại với --force để ghi đè (DB cũ sẽ được đổi tên thành .bak).`);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) await fsp.rename(target, `${target}.${stamp()}.bak`);
  for (const ext of ["-wal", "-shm"]) await fsp.rm(target + ext, { force: true });
  await fsp.copyFile(path.join(root, "db", pick), target);
  log(`[restore] DB <- ${pick}`);

  const existing = new Set(await storage.list(""));
  let uploaded = 0, total = 0;
  const walk = async (d, prefix) => {
    for (const e of await fsp.readdir(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), rel);
      else if (!e.name.endsWith(".tmp")) {
        total++;
        if (existing.has(rel)) continue;
        await storage.put(rel, await fsp.readFile(path.join(d, e.name)));
        uploaded++;
      }
    }
  };
  await walk(path.join(root, "files"), "");
  log(`[restore] kho: ${total} file trong bản sao lưu, đẩy lên ${uploaded} file còn thiếu`);
  return { db: pick, total, uploaded };
}
