// id trùng với server (server/src/image.js). CSS chỉ để XEM TRƯỚC; bản lưu do server render bằng sharp.
export const FILTERS = [
  { id: 'none', label: 'Gốc', css: 'none' },
  { id: 'dreamy', label: 'Mơ màng', css: 'brightness(1.06) saturate(1.15) contrast(.95) hue-rotate(-8deg)' },
  { id: 'bw', label: 'Trắng đen', css: 'grayscale(1) contrast(1.05)' },
  { id: 'sepia', label: 'Cổ điển', css: 'sepia(.7) contrast(1.05)' },
  { id: 'warm', label: 'Nắng', css: 'sepia(.25) saturate(1.25) brightness(1.04) hue-rotate(-10deg)' },
  { id: 'cool', label: 'Biển', css: 'hue-rotate(10deg) saturate(1.1) brightness(1.03)' },
  { id: 'film', label: 'Phim', css: 'contrast(1.18) saturate(.9) brightness(.98) sepia(.12)' },
];
export const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css || 'none';
