import sharp from 'sharp';
import { config } from './config.js';

const L = config.limits;
sharp.cache(false);

export class ImageError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------- 1. Nhận dạng bằng chữ ký file (không tin extension / MIME khai báo) ---------- */
export function sniffType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/* ---------- 2-4. Kiểm tra + chuẩn hóa -> bản gốc đã chuẩn hóa ---------- */
// Xoay pixel theo EXIF rồi mới bỏ EXIF (sharp không giữ metadata nếu không gọi withMetadata).
export async function normalizeOriginal(buf) {
  if (!sniffType(buf)) throw new ImageError('unsupported_type', 'Chỉ nhận ảnh JPEG hoặc PNG thật (chữ ký file không hợp lệ).');

  let meta;
  try { meta = await sharp(buf, { failOn: 'warning' }).metadata(); }
  catch { throw new ImageError('corrupt_image', 'Không đọc được ảnh (file hỏng).'); }

  // Giới hạn pixel kiểm TRƯỚC khi giải mã toàn bộ; dùng BigInt để tránh tràn số.
  if (!meta.width || !meta.height) throw new ImageError('corrupt_image', 'Không đọc được kích thước ảnh.');
  if (BigInt(meta.width) * BigInt(meta.height) > BigInt(L.maxPixels)) {
    throw new ImageError('too_many_pixels', `Ảnh vượt quá ${L.maxPixels / 1e6} triệu pixel.`);
  }

  try {
    const { data, info } = await sharp(buf, { failOn: 'warning', limitInputPixels: L.maxPixels })
      .rotate() // auto-orient theo EXIF
      .resize({ width: L.originalMaxEdge, height: L.originalMaxEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 95 })
      .toBuffer({ resolveWithObject: true });
    return { buf: data, width: info.width, height: info.height };
  } catch (e) {
    throw new ImageError('corrupt_image', 'Ảnh bị hỏng hoặc thiếu dữ liệu, không giải mã được.');
  }
}

/* ---------- Filter: id dùng chung với client (client có bản CSS tương ứng để xem trước) ---------- */
const SEPIA = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];
const blend = (m, k) => m.map((row, i) => row.map((v, j) => k * v + (1 - k) * (i === j ? 1 : 0)));
export const FILTERS = {
  none: (s) => s,
  dreamy: (s) => s.modulate({ brightness: 1.06, saturation: 1.15, hue: -8 }).linear(0.95, 6.4),
  bw: (s) => s.greyscale().linear(1.05, -6.4),
  sepia: (s) => s.recomb(blend(SEPIA, 0.7)).linear(1.05, -6.4),
  warm: (s) => s.recomb([[1.08, 0.05, 0], [0, 1.02, 0], [0, 0, 0.88]]).modulate({ saturation: 1.2 }),
  cool: (s) => s.recomb([[0.92, 0, 0.02], [0, 1.0, 0.05], [0.02, 0.06, 1.1]]).modulate({ brightness: 1.03 }),
  film: (s) => s.linear(1.18, -23).modulate({ saturation: 0.9 }),
};

/* ---------- Thông số chỉnh sửa ---------- */
export const DEFAULT_EDIT = { crop: null, rotate: 0, flip: false, filter: 'none' };

// Thứ tự áp dụng: xoay -> lật ngang -> crop (tọa độ crop là phân số 0..1 của ảnh SAU xoay/lật) -> filter.
export function parseEdit(raw) {
  const e = raw == null ? {} : raw;
  if (typeof e !== 'object' || Array.isArray(e)) throw new ImageError('invalid_edit', 'Thông số chỉnh sửa không hợp lệ.');
  const rotate = e.rotate ?? 0;
  if (![0, 90, 180, 270].includes(rotate)) throw new ImageError('invalid_edit', 'Góc xoay chỉ nhận 0, 90, 180 hoặc 270.');
  const flip = e.flip ?? false;
  if (typeof flip !== 'boolean') throw new ImageError('invalid_edit', 'Giá trị lật phải là true/false.');
  const filter = e.filter ?? 'none';
  if (!Object.hasOwn(FILTERS, filter)) throw new ImageError('invalid_edit', 'Filter không tồn tại.');
  let crop = e.crop ?? null;
  if (crop) {
    const { x, y, w, h } = crop;
    const ok = [x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n));
    const eps = 1e-6;
    if (!ok || x < -eps || y < -eps || w <= 0 || h <= 0 || x + w > 1 + eps || y + h > 1 + eps) {
      throw new ImageError('invalid_edit', 'Vùng crop nằm ngoài ảnh.');
    }
    crop = { x: Math.max(0, x), y: Math.max(0, y), w, h };
  }
  return { crop, rotate, flip, filter };
}

export function classifyAspect(w, h) {
  const r = w / h;
  const near = (t) => Math.abs(r - t) / t <= L.aspectTolerance;
  if (near(1)) return '1:1';
  if (near(4 / 3)) return '4:3';
  if (near(3 / 4)) return '3:4';
  return null;
}

/* ---------- Render một version: bản gốc + thông số -> các variant WebP ---------- */
export async function renderVersion(originalBuf, edit) {
  // Giai đoạn A: xoay + lật (raw để đảm bảo đúng thứ tự thao tác)
  let stage = sharp(originalBuf, { limitInputPixels: L.maxPixels * 2 });
  if (edit.rotate) stage = stage.rotate(edit.rotate);
  if (edit.flip) stage = stage.flop();
  let { data, info } = await stage.raw().toBuffer({ resolveWithObject: true });
  let raw = { width: info.width, height: info.height, channels: info.channels };

  // Giai đoạn B: crop + filter
  let s = sharp(data, { raw });
  if (edit.crop) {
    const left = Math.min(raw.width - 1, Math.round(edit.crop.x * raw.width));
    const top = Math.min(raw.height - 1, Math.round(edit.crop.y * raw.height));
    const width = Math.min(raw.width - left, Math.round(edit.crop.w * raw.width));
    const height = Math.min(raw.height - top, Math.round(edit.crop.h * raw.height));
    if (width < L.minCropEdge || height < L.minCropEdge) {
      if (!(raw.width < L.minCropEdge || raw.height < L.minCropEdge)) {
        throw new ImageError('crop_too_small', `Vùng crop quá nhỏ (tối thiểu ${L.minCropEdge}px).`);
      }
    }
    s = s.extract({ left, top, width, height });
  }
  s = FILTERS[edit.filter](s);
  ({ data, info } = await s.raw().toBuffer({ resolveWithObject: true }));
  raw = { width: info.width, height: info.height, channels: info.channels };

  const aspect = classifyAspect(raw.width, raw.height);
  if (!aspect) throw new ImageError('aspect_not_allowed', 'Tỉ lệ ảnh phải là 1:1, 4:3 hoặc 3:4 (hãy crop lại).');

  // Variant: không phóng lớn, không trùng chiều rộng, tối đa 3 file
  const top = Math.min(raw.width, Math.max(...L.variantWidths));
  const widths = [...new Set([...L.variantWidths.filter((w) => w < top), top])].sort((a, b) => a - b);

  const variants = [];
  for (const w of widths) {
    const { data: out, info: oi } = await sharp(data, { raw })
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ width: oi.width, height: oi.height, mime: 'image/webp', bytes: out.length, buf: out });
  }
  return { width: raw.width, height: raw.height, aspect, variants };
}

/* ---------- Avatar ---------- */
export async function renderAvatar(buf) {
  if (!sniffType(buf)) throw new ImageError('unsupported_type', 'Avatar phải là ảnh JPEG hoặc PNG.');
  try {
    const meta = await sharp(buf, { failOn: 'warning' }).metadata();
    if (BigInt(meta.width) * BigInt(meta.height) > BigInt(L.maxPixels)) throw new ImageError('too_many_pixels', 'Ảnh quá lớn.');
    return await sharp(buf, { failOn: 'warning', limitInputPixels: L.maxPixels })
      .rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 85 }).toBuffer();
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError('corrupt_image', 'Ảnh avatar bị hỏng.');
  }
}

/* ---------- Tải về: JPEG từ variant lớn nhất ---------- */
export async function toJpeg(webpBuf) {
  return sharp(webpBuf).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
}
