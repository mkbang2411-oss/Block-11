// Khôi phục từ bản sao lưu. DỪNG server trước khi chạy.
//   npm run restore -- D:/khoanh-khac-backup            (DB trống/chưa có: chép DB mới nhất + đẩy ảnh lên kho)
//   npm run restore -- D:/khoanh-khac-backup --force    (ghi đè DB hiện có, DB cũ đổi tên thành .bak)
//   thêm --db gallery-2026-11-23_19-40-00.db            để chọn một bản DB cụ thể
import { config } from "../src/config.js";
import { createStorage, initWithRetry } from "../src/storage/index.js";
import { restoreAll } from "../src/backup.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const i = args.indexOf("--db");
const dbName = i >= 0 ? args[i + 1] : undefined;
const dir = args.find((a, j) => !a.startsWith("--") && args[j - 1] !== "--db") || process.env.BACKUP_DIR || "./backups";
const storage = createStorage();
await initWithRetry(storage, { tries: 5 });
await restoreAll({ storage, dir, dbPath: config.dbPath, dbName, force });
