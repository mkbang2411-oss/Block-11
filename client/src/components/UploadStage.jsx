import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crop, ImagePlus, Send, X } from 'lucide-react';
import { RATIO_KEYS, centerCrop, fmtBytes } from '../lib/img.js';
import Modal from './Modal.jsx';
import Cropper from './Cropper.jsx';

function CropModal({ item, onClose, onApply }) {
  const [ratio, setRatio] = useState(item.ratio);
  const [crop, setCrop] = useState(item.crop || { x: 0, y: 0, w: 1, h: 1 });
  const pick = (k) => { setRatio(k); setCrop(centerCrop(item.nat.w, item.nat.h, k)); };
  return (
    <Modal onClose={onClose} title="crop.exe" wide className="editor">
      <div className="editor-body">
        <div className="editor-canvas"><Cropper src={item.url} nat={item.nat} ratio={ratio} crop={crop} onCrop={setCrop} /></div>
        <div className="editor-tools">
          <div className="tool-row">
            {RATIO_KEYS.map((k) => <button key={k} className={`chip-btn ${ratio === k ? 'on' : ''}`} onClick={() => pick(k)}>{k}</button>)}
            <span className="grow" />
            <button className="btn ghost" onClick={onClose}>Hủy</button>
            <button className="btn primary" onClick={() => onApply(ratio, crop.w > 0.9995 && crop.h > 0.9995 ? null : crop)}>Áp dụng</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Danh sách ảnh chờ đăng: mỗi ảnh có tỉ lệ, crop, tiêu đề, mô tả (alt). Gửi 1–5 ảnh trong MỘT request.
export default function UploadStage({ items, setItems, max, onAddClick, onPost, posting, progress, onClose }) {
  const [cropping, setCropping] = useState(null);
  const patch = (id, p) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id) => setItems((l) => { const x = l.find((i) => i.id === id); if (x) URL.revokeObjectURL(x.url); return l.filter((i) => i.id !== id); });
  const total = items.reduce((s, i) => s + i.file.size, 0);

  return (
    <div className="stage-list">
      <header className="stage-head">
        <h2 className="display">Chuẩn bị đăng</h2>
        <span className="muted">{items.length}/{max} ảnh · {fmtBytes(total)}</span>
        <button className="icon-btn sm" onClick={onClose} aria-label="Quay lại" disabled={posting}><X size={16} /></button>
      </header>

      <ul className="stage-items">
        <AnimatePresence initial={false}>
          {items.map((it) => (
            <motion.li key={it.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} className={`stage-item ${it.error ? 'bad' : ''}`}>
              <button className="thumb" onClick={() => setCropping(it)} disabled={posting} aria-label="Cắt ảnh" style={{ aspectRatio: 1 }}>
                <img src={it.url} alt="" draggable={false} />
                <span className="badge">{it.ratio}{it.crop ? ' · đã cắt' : ''}</span>
                <span className="crop-hint"><Crop size={14} /></span>
              </button>
              <div className="fields">
                <input value={it.title} maxLength={120} placeholder="Tiêu đề" aria-label="Tiêu đề" disabled={posting} onChange={(e) => patch(it.id, { title: e.target.value })} />
                <input value={it.alt} maxLength={300} placeholder="Mô tả ảnh cho người dùng đọc màn hình (alt)" aria-label="Mô tả ảnh" disabled={posting} onChange={(e) => patch(it.id, { alt: e.target.value })} />
                {it.error && <p className="note err" role="alert">{it.error}</p>}
              </div>
              <button className="icon-btn sm" onClick={() => remove(it.id)} disabled={posting} aria-label="Bỏ ảnh"><X size={14} /></button>
            </motion.li>
          ))}
        </AnimatePresence>
        {items.length < max && (
          <li><button className="add-more" onClick={onAddClick} disabled={posting}><ImagePlus size={20} /> {items.length ? 'Thêm ảnh' : 'Chọn ảnh từ máy'}</button></li>
        )}
      </ul>

      <footer className="stage-foot">
        {posting && <div className="progress" aria-label="Tiến độ tải lên"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        <button className="btn primary big" onClick={onPost} disabled={!items.length || posting}>
          <Send size={18} /> {posting ? `Đang đăng… ${Math.round(progress * 100)}%` : `Đăng ${items.length || ''} ảnh`}
        </button>
      </footer>
      <AnimatePresence>
        {cropping && <CropModal key="c" item={items.find((i) => i.id === cropping.id) || cropping} onClose={() => setCropping(null)} onApply={(ratio, crop) => { patch(cropping.id, { ratio, crop, error: '' }); setCropping(null); }} />}
      </AnimatePresence>
    </div>
  );
}
