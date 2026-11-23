export const RATIOS = { '1:1': 1, '4:3': 4 / 3, '3:4': 3 / 4 };
export const RATIO_KEYS = Object.keys(RATIOS);
export const ACCEPT = 'image/jpeg,image/png';
export const TOLERANCE = 0.02;

export const isAllowedRatio = (w, h) => RATIO_KEYS.some((k) => Math.abs(w / h - RATIOS[k]) / RATIOS[k] <= TOLERANCE);

export function nearestRatio(w, h) {
  const r = w / h;
  return RATIO_KEYS.reduce((best, k) => (Math.abs(Math.log(r / RATIOS[k])) < Math.abs(Math.log(r / RATIOS[best])) ? k : best), '4:3');
}

// Hộp crop lớn nhất, căn giữa, đúng tỉ lệ ratioKey, tính theo phân số của ảnh kích thước (tw x th)
export function centerCrop(tw, th, ratioKey) {
  const R = RATIOS[ratioKey];
  let w = tw, h = tw / R;
  if (h > th) { h = th; w = th * R; }
  return { x: (tw - w) / 2 / tw, y: (th - h) / 2 / th, w: w / tw, h: h / th };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Không đọc được ảnh này.'));
    i.src = src;
  });
}

export const swapRatio = (k) => (k === '4:3' ? '3:4' : k === '3:4' ? '4:3' : k);

export function fmtBytes(n) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

// Cắt vùng crop (phân số) từ ảnh đã tải -> Blob JPEG (dùng cho avatar và chụp camera)
export function cropToBlob(img, crop, outSize = 512, type = 'image/jpeg', quality = 0.92) {
  const sw = img.naturalWidth * crop.w, sh = img.naturalHeight * crop.h;
  const scale = Math.min(1, outSize / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  c.getContext('2d').drawImage(img, img.naturalWidth * crop.x, img.naturalHeight * crop.y, sw, sh, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, type, quality));
}
