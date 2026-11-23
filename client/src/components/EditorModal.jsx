import { useEffect, useMemo, useState } from 'react';
import { Check, FlipHorizontal2, RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { loadImage, RATIO_KEYS, centerCrop, swapRatio } from '../lib/img.js';
import { FILTERS } from '../lib/filters.js';
import { useApp } from '../store.jsx';
import Modal from './Modal.jsx';
import Cropper from './Cropper.jsx';

/* Chỉnh sửa ảnh (bonus): crop, xoay, lật, filter, khôi phục.
   Luôn chỉnh từ BẢN GỐC đã chuẩn hóa (/original), gửi đầy đủ trạng thái hiện tại + baseVersion; server tạo version mới. */
export default function EditorModal({ photo, onClose, onSaved }) {
  const { toast } = useApp();
  const src = api.originalUrl(photo.id);
  const [nat, setNat] = useState(null);
  const [rotate, setRotate] = useState(photo.edit.rotate || 0);
  const [flip, setFlip] = useState(!!photo.edit.flip);
  const [filter, setFilter] = useState(photo.edit.filter || 'none');
  const [ratio, setRatio] = useState(photo.aspect);
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    loadImage(src).then((img) => {
      if (dead) return;
      const n = { w: img.naturalWidth, h: img.naturalHeight };
      setNat(n);
      const sw = (photo.edit.rotate || 0) % 180 !== 0;
      setCrop(photo.edit.crop || centerCrop(sw ? n.h : n.w, sw ? n.w : n.h, photo.aspect));
    }).catch(() => { toast('Không mở được ảnh gốc để chỉnh sửa.', 'err'); onClose(); });
    return () => { dead = true; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const dims = useMemo(() => (nat ? (rotate % 180 ? { w: nat.h, h: nat.w } : nat) : null), [nat, rotate]);

  const rot = (dir) => {
    const next = (rotate + dir + 360) % 360, nr = swapRatio(ratio);
    setRotate(next); setRatio(nr);
    setCrop(centerCrop(next % 180 ? nat.h : nat.w, next % 180 ? nat.w : nat.h, nr)); // xoay thì đặt lại khung crop
  };
  const doFlip = () => { setFlip((f) => !f); setCrop((c) => ({ ...c, x: 1 - (c.x + c.w) })); }; // khung crop lật theo ảnh
  const pickRatio = (k) => { setRatio(k); setCrop(centerCrop(dims.w, dims.h, k)); };

  const full = crop && crop.w > 0.9995 && crop.h > 0.9995;
  const payload = { rotate, flip, filter, crop: full ? null : crop };
  const dirty = crop && JSON.stringify(payload) !== JSON.stringify({ rotate: photo.edit.rotate || 0, flip: !!photo.edit.flip, filter: photo.edit.filter || 'none', crop: photo.edit.crop || null });

  const save = async (restore = false) => {
    setBusy(true);
    try {
      const r = await api.editPhoto(photo.id, restore ? { baseVersion: photo.version, restore: true } : { baseVersion: photo.version, edit: payload });
      toast(restore ? 'Đã khôi phục ảnh gốc ✦' : 'Đã lưu chỉnh sửa ✦');
      onSaved(r.photo);
    } catch (e) { toast(e.message, 'err'); setBusy(false); }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} title="edit.exe" wide className="editor">
      <div className="editor-body">
        <div className="editor-canvas">
          {nat && crop ? <Cropper src={src} nat={nat} rotate={rotate} flip={flip} filter={filter} ratio={ratio} crop={crop} onCrop={setCrop} /> : <div className="loading-dots"><i /><i /><i /></div>}
        </div>
        <div className="editor-tools">
          <div className="tool-row">
            <button className="icon-btn" onClick={() => rot(-90)} disabled={!nat} aria-label="Xoay trái 90°" title="Xoay trái"><RotateCcw size={18} /></button>
            <button className="icon-btn" onClick={() => rot(90)} disabled={!nat} aria-label="Xoay phải 90°" title="Xoay phải"><RotateCw size={18} /></button>
            <button className={`icon-btn ${flip ? 'on' : ''}`} onClick={doFlip} disabled={!nat} aria-label="Lật ngang" title="Lật ngang"><FlipHorizontal2 size={18} /></button>
            <span className="sep" />
            {RATIO_KEYS.map((k) => (
              <button key={k} className={`chip-btn ${ratio === k ? 'on' : ''}`} onClick={() => pickRatio(k)} disabled={!nat}>{k}</button>
            ))}
          </div>
          <div className="filter-strip" role="listbox" aria-label="Bộ lọc màu">
            {FILTERS.map((f) => (
              <button key={f.id} className={`filter ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} role="option" aria-selected={filter === f.id}>
                <img src={src} alt="" draggable={false} style={{ filter: f.css }} /><span>{f.label}</span>
              </button>
            ))}
          </div>
          <div className="editor-actions">
            <button className="btn ghost" onClick={() => save(true)} disabled={busy || !photo.edited} title="Quay về ảnh lúc mới đăng"><Undo2 size={16} /> Khôi phục</button>
            <span className="grow" />
            <button className="btn ghost" onClick={onClose} disabled={busy}>Hủy</button>
            <button className="btn primary" onClick={() => save(false)} disabled={busy || !dirty}><Check size={16} /> {busy ? 'Đang lưu…' : 'Lưu'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
