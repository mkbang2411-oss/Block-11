import { config } from '../config.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';

// Chọn nơi lưu MỘT LẦN khi khởi động. Không tự fallback sang local khi S3 lỗi
// (tránh file nằm rải ở hai nơi): lỗi được trả về và xử lý bằng cleanup.
export function createStorage() {
  const { driver, localRoot, s3 } = config.storage;
  if (driver === 'local') return new LocalStorage(localRoot);
  if (driver === 'seaweedfs' || driver === 's3') return new S3Storage(s3);
  throw new Error(`STORAGE_DRIVER không hợp lệ: ${driver}`);
}
