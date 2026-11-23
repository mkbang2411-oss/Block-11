// Sinh dữ liệu kiểm thử (slide 33). Chạy: node scripts/make-test-data.mjs [thư-mục-ra]
// Tọa độ GPS dưới đây là GIẢ LẬP (10.0, 106.0), không phải vị trí thật của ai.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function makeTestData(out) {
  fs.mkdirSync(out, { recursive: true });
  const w = (name, buf) => { fs.writeFileSync(path.join(out, name), buf); return path.join(out, name); };

  // Ảnh có nửa trái đỏ, nửa phải xanh để kiểm hướng
  const halves = (W, H) => sharp({ create: { width: W, height: H, channels: 3, background: '#2255ee' } })
    .composite([{ input: { create: { width: Math.floor(W / 2), height: H, channels: 3, background: '#ee3355' } }, left: 0, top: 0 }]);

  const files = {};
  files.jpeg43 = w('jpeg-4x3.jpg', await halves(1200, 900).jpeg({ quality: 88 }).toBuffer());
  files.jpeg34 = w('jpeg-3x4.jpg', await halves(900, 1200).jpeg({ quality: 88 }).toBuffer());
  files.png11 = w('png-1x1.png', await halves(800, 800).png().toBuffer());
  files.wide = w('jpeg-16x9-wide.jpg', await halves(1600, 900).jpeg().toBuffer()); // tỉ lệ KHÔNG được phép
  files.small = w('png-1x1-small-200.png', await halves(200, 200).png().toBuffer()); // nhỏ hơn mọi ngưỡng variant

  // EXIF: pixel lưu NGANG 800x600, Orientation=6 (cần xoay 90° -> hiển thị DỌC 600x800), kèm GPS giả
  files.exif = w('exif-orient6-gps.jpg', await halves(800, 600).jpeg({ quality: 90 }).withMetadata({ orientation: 6, exif: {
    IFD0: { Make: 'TestCam' },
    IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 0/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 0/1 0/1' },
  } }).toBuffer());

  files.fakeText = w('fake-image.jpg', Buffer.from('Đây chỉ là file văn bản đổi đuôi .jpg\n'.repeat(200)));
  const good = await halves(1200, 900).jpeg({ quality: 90 }).toBuffer();
  files.truncated = w('truncated.jpg', good.subarray(0, Math.floor(good.length * 0.45))); // chữ ký đúng nhưng thiếu bytes
  files.hugePixels = w('huge-pixels-49mp.png', await sharp({ create: { width: 7000, height: 7000, channels: 3, background: '#88aaff' } }).png({ compressionLevel: 9 }).toBuffer()); // nhỏ về dung lượng, > 40MP
  const W = 2600, H = 1950;
  files.tooLarge = w('too-large-over-10MiB.png', await sharp(crypto.randomBytes(W * H * 3), { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer());
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] || '../test-data');
  const f = await makeTestData(out);
  for (const [k, p] of Object.entries(f)) console.log(k.padEnd(10), (fs.statSync(p).size / 1024).toFixed(0).padStart(7), 'KiB', path.basename(p));
}
