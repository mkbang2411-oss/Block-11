// Sao lưu DB + ảnh. Chạy: npm run backup            (ra thư mục BACKUP_DIR, mặc định ./backups)
//                         npm run backup -- D:/khoanh-khac-backup
// Có thể chạy khi server đang chạy. Nên đặt thư mục sao lưu ở Ổ ĐĨA KHÁC (hoặc ổ ngoài/cloud).
import { db } from "../src/db.js";
import { createStorage } from "../src/storage/index.js";
import { initWithRetry } from "../src/storage/index.js";
import { backupAll } from "../src/backup.js";

const dir = process.argv[2] || process.env.BACKUP_DIR || "./backups";
const keep = Number(process.env.BACKUP_KEEP_DB || 14);
const storage = createStorage();
await initWithRetry(storage, { tries: 5 });
await backupAll({ db, storage, dir, keep });
db.close();
