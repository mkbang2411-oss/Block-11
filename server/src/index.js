import { config } from "./config.js";
import { createStorage, initWithRetry } from "./storage/index.js";
import { createApp } from "./app.js";
import { runCleanup } from "./photoService.js";
import { db } from "./db.js";
import { startAutoBackup } from "./backup.js";

const storage = createStorage();
await initWithRetry(storage); // chờ tối đa ~60 giây nếu SeaweedFS đang khởi động
console.log("[storage]", storage.name);

const app = createApp(storage);
await runCleanup(storage).catch((e) => console.error("[cleanup]", e.message)); // dọn dở dang sau restart
setInterval(
  () => runCleanup(storage).catch((e) => console.error("[cleanup]", e.message)),
  config.cleanup.intervalMs,
).unref();

app.listen(config.port, () =>
  console.log(`[server] http://localhost:${config.port}`),
);

// Tự sao lưu: bật bằng cách đặt BACKUP_DIR trong .env (nên là ổ đĩa khác). Bỏ trống = tắt.
if (process.env.BACKUP_DIR) {
  startAutoBackup({
    db,
    storage,
    dir: process.env.BACKUP_DIR,
    intervalMs: Number(process.env.BACKUP_INTERVAL_HOURS || 24) * 3600e3,
    keep: Number(process.env.BACKUP_KEEP_DB || 14),
  });
}
