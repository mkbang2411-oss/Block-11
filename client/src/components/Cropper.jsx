import { useRef } from 'react';
import { useElementSize } from '../lib/hooks.js';
import { RATIOS } from '../lib/img.js';
import { filterCss } from '../lib/filters.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Cropper khóa tỉ lệ. Hiển thị ảnh gốc đã xoay/lật (CSS), crop lưu dạng PHÂN SỐ (0..1) của ảnh sau xoay/lật
   -> khớp với server (xoay -> lật -> crop -> filter). */
export default function Cropper({ src, nat, rotate = 0, flip = false, filter = 'none', ratio, crop, onCrop }) {
  const [wrap, size] = useElementSize();
  const stage = useRef(null);
  const drag = useRef(null);

  const swapped = rotate % 180 !== 0;
  const tw = swapped ? nat.h : nat.w, th = swapped ? nat.w : nat.h;
  const scale = size.w > 20 && size.h > 20 ? Math.min((size.w - 8) / tw, (size.h - 8) / th) : 0;
  const W = tw * scale, H = th * scale, R = RATIOS[ratio];
  const box = { x: crop.x * W, y: crop.y * H, w: crop.w * W, h: crop.h * H };
  const toFrac = (b) => ({ x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H });

  const grab = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); };
  const startMove = (e) => { grab(e); drag.current = { type: 'move', sx: e.clientX, sy: e.clientY, box: { ...box } }; };
  const startResize = (corner) => (e) => {
    e.stopPropagation(); grab(e);
    const sx = corner.includes('e') ? 1 : -1, sy = corner.includes('s') ? 1 : -1;
    drag.current = { type: 'resize', sx, sy, ax: sx > 0 ? box.x : box.x + box.w, ay: sy > 0 ? box.y : box.y + box.h };
  };
  const onMove = (e) => {
    const d = drag.current; if (!d || !scale) return;
    if (d.type === 'move') {
      onCrop(toFrac({ ...d.box, x: clamp(d.box.x + e.clientX - d.sx, 0, W - d.box.w), y: clamp(d.box.y + e.clientY - d.sy, 0, H - d.box.h) }));
      return;
    }
    const r = stage.current.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const maxW = Math.min(d.sx > 0 ? W - d.ax : d.ax, (d.sy > 0 ? H - d.ay : d.ay) * R);
    const w = clamp((Math.abs(px - d.ax) + Math.abs(py - d.ay) * R) / 2, Math.min(maxW, 56), maxW);
    const h = w / R;
    onCrop(toFrac({ x: d.sx > 0 ? d.ax : d.ax - w, y: d.sy > 0 ? d.ay : d.ay - h, w, h }));
  };
  const end = () => { drag.current = null; };
  const handlers = { onPointerMove: onMove, onPointerUp: end, onPointerCancel: end };

  return (
    <div className="cropper" ref={wrap}>
      {scale > 0 && (
        <div className="crop-stage" ref={stage} style={{ width: W, height: H }}>
          <img src={src} alt="" draggable={false} style={{
            position: 'absolute', maxWidth: 'none', width: nat.w * scale, height: nat.h * scale,
            left: (W - nat.w * scale) / 2, top: (H - nat.h * scale) / 2,
            transform: `scaleX(${flip ? -1 : 1}) rotate(${rotate}deg)`, filter: filterCss(filter),
          }} />
          <div className="crop-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDown={startMove} {...handlers}>
            <i className="crop-grid" />
            {['nw', 'ne', 'sw', 'se'].map((c) => <b key={c} className={`crop-handle ${c}`} onPointerDown={startResize(c)} {...handlers} />)}
          </div>
        </div>
      )}
    </div>
  );
}
