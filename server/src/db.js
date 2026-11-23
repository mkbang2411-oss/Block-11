import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  google_picture TEXT,
  avatar_key TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted
  created_at INTEGER NOT NULL,
  UNIQUE(from_id, to_email)
);
CREATE INDEX IF NOT EXISTS idx_fr_to ON friend_requests(to_email, status);

-- Photo: chỉ metadata, KHÔNG chứa bytes ảnh hay đường dẫn tuyệt đối (chỉ storage key)
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  aspect TEXT NOT NULL,            -- 1:1 | 4:3 | 3:4 của version hiện tại
  width INTEGER NOT NULL,          -- kích thước lớn nhất của version hiện tại
  height INTEGER NOT NULL,
  slot INTEGER NOT NULL,           -- vị trí trong album
  current_version INTEGER NOT NULL DEFAULT 1,
  original_key TEXT NOT NULL,      -- bản gốc đã chuẩn hóa (xoay theo EXIF, đã bỏ EXIF)
  base_edit TEXT NOT NULL,         -- JSON thông số lúc upload (dùng cho "Khôi phục")
  edit TEXT NOT NULL,              -- JSON thông số hiện tại
  status TEXT NOT NULL DEFAULT 'published', -- published | deleting
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_id, status, slot);
CREATE INDEX IF NOT EXISTS idx_photos_feed ON photos(status, created_at DESC);

CREATE TABLE IF NOT EXISTS photo_variants (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  PRIMARY KEY (photo_id, version, width)
);

CREATE TABLE IF NOT EXISTS reactions (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (photo_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_photo ON comments(photo_id, id);

-- Thông báo: ai đó tương tác với mình (thả cảm xúc, bình luận, lời mời kết bạn...)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- người nhận
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- người làm
  type TEXT NOT NULL,              -- reaction | comment | friend_request | friend_accepted
  photo_id TEXT REFERENCES photos(id) ON DELETE CASCADE,
  data TEXT,                       -- JSON nhỏ: emoji, đoạn bình luận
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id DESC);

-- Danh sách key cần dọn lại (compensation thất bại, version cũ chờ hết hạn)
CREATE TABLE IF NOT EXISTS cleanup_queue (
  storage_key TEXT PRIMARY KEY,
  not_before INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
`);

export const now = () => Date.now();
