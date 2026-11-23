// Toàn bộ cấu hình đọc từ biến môi trường. Xem .env.example.
const env = process.env;
const int = (k, d) => (env[k] !== undefined && env[k] !== '' ? parseInt(env[k], 10) : d);

export const config = {
  port: int('PORT', 4000),
  isProd: env.NODE_ENV === 'production',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  cookieSecure: env.COOKIE_SECURE === '1',
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  authDev: env.AUTH_DEV === '1', // đăng nhập thử không cần Google (CHỈ dùng khi dev)
  debugFaults: env.DEBUG_FAULTS === '1', // cho phép gây lỗi có chủ đích để nghiệm thu (?fail=db|storage)
  dbPath: env.DB_PATH || './data/gallery.db',
  clientDist: env.CLIENT_DIST || '../client/dist',

  storage: {
    driver: env.STORAGE_DRIVER || 'seaweedfs', // seaweedfs | s3 | local
    localRoot: env.LOCAL_STORAGE_ROOT || './data/uploads',
    s3: {
      endpoint: env.S3_ENDPOINT || 'http://localhost:8333',
      region: env.S3_REGION || 'us-east-1',
      bucket: env.S3_BUCKET || 'gallery',
      accessKeyId: env.S3_ACCESS_KEY || '',
      secretAccessKey: env.S3_SECRET_KEY || '',
    },
  },

  // Các ngưỡng công bố (README mục "Giới hạn")
  limits: {
    maxFiles: 5,
    maxFileBytes: 10 * 1024 * 1024, // 10 MiB / file
    maxRequestBytes: 55 * 1024 * 1024, // 55 MiB / request -> 413
    maxPixels: 40_000_000, // 40 triệu pixel
    variantWidths: [320, 960, 1600],
    originalMaxEdge: 4096, // bản gốc chuẩn hóa được giới hạn cạnh dài 4096px
    minCropEdge: 64,
    avatarMaxBytes: 4 * 1024 * 1024,
    aspectTolerance: 0.02,
    slotsPerPage: 6,
    maxSlot: 599,
  },

  cleanup: {
    oldVersionTtlMs: int('OLD_VERSION_TTL_MS', 60 * 60 * 1000), // giữ file version cũ 1 giờ rồi xóa
    intervalMs: int('CLEANUP_INTERVAL_MS', 60 * 1000),
  },
};
