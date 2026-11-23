import { config } from "../config.js";
import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";

// Chọn nơi lưu MỘT LẦN khi khởi động. Không tự fallback sang local khi S3 lỗi
// (tránh file nằm rải ở hai nơi): lỗi được trả về và xử lý bằng cleanup.
export function createStorage() {
  const { driver, localRoot, s3 } = config.storage;
  if (driver === "local") return new LocalStorage(localRoot);
  if (driver === "seaweedfs" || driver === "s3") return new S3Storage(s3);
  throw new Error(`STORAGE_DRIVER không hợp lệ: ${driver}`);
}

// Chờ kho sẵn sàng khi khởi động: chỉ thử lại khi "chưa kết nối được" (kho đang bật dậy).
// Sai khóa / thiếu bucket thì báo ngay, thử lại cũng vô ích.
export async function initWithRetry(
  storage,
  { tries = 30, delayMs = 2000, log = console.log } = {},
) {
  for (let i = 1; ; i++) {
    try {
      return await storage.init();
    } catch (e) {
      if (e?.code !== "STORAGE_UNREACHABLE" || i >= tries) throw e;
      log(`[storage] chưa kết nối được kho, thử lại ${i}/${tries}...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
