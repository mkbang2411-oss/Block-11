import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera as CamIcon, RotateCcw, Send, SwitchCamera, Timer, X } from 'lucide-react';
import { RATIOS, RATIO_KEYS } from '../lib/img.js';

// Viewfinder: getUserMedia, khung cắt theo tỉ lệ 1:1 / 4:3 / 3:4, hẹn giờ 3s, chụp xong đăng liền.
export default function Camera({ onClose, onPost, onFallback, posting, progress }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [facing, setFacing] = useState('user');
  const [ratio, setRatio] = useState('3:4');
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const [timer, setTimer] = useState(false);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [shot, setShot] = useState(null); // { file, url }
  const [title, setTitle] = useState('');

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };

  useEffect(() => {
    if (shot) return undefined;
    if (!navigator.mediaDevices?.getUserMedia) { setErr('unsupported'); return undefined; }
    let dead = false; setReady(false);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stop(); stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        setErr('');
      })
      .catch((e) => setErr(e.name === 'NotAllowedError' ? 'denied' : 'unsupported'));
    return () => { dead = true; stop(); };
  }, [facing, shot]);

  const capture = useCallback(() => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const R = RATIOS[ratio]; const vw = v.videoWidth, vh = v.videoHeight;
    let sw = vw, sh = vw / R; if (sh > vh) { sh = vh; sw = vh * R; }
    const k = Math.min(1, 2400 / Math.max(sw, sh));
    const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext('2d').drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    setFlash(true); setTimeout(() => setFlash(false), 220);
    c.toBlob((b) => {
      const file = new File([b], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setShot({ file, url: URL.createObjectURL(file) });
    }, 'image/jpeg', 0.92);
  }, [ratio]);

  const shutter = () => {
    if (!timer) return capture();
    let n = 3; setCount(n);
    const t = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(t); capture(); } }, 1000);
  };
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  if (err) return (
    <div className="cam-error">
      <p className="display big">{err === 'denied' ? 'Chưa có quyền dùng camera' : 'Thiết bị này chưa mở được camera'}</p>
      <p className="muted">{err === 'denied' ? 'Hãy cho phép camera trong thanh địa chỉ của trình duyệt rồi thử lại.' : 'Bạn vẫn có thể chụp bằng ứng dụng máy ảnh rồi chọn ảnh vừa chụp.'}</p>
      <div className="row gap">
        <label className="btn primary">Chọn ảnh vừa chụp<input type="file" accept="image/jpeg,image/png" capture="environment" hidden onChange={(e) => { onFallback([...e.target.files]); e.target.value = ''; }} /></label>
        <button className="btn ghost" onClick={onClose}>Quay lại</button>
      </div>
    </div>
  );

  return (
    <div className="camera">
      <button className="icon-btn cam-close" onClick={onClose} aria-label="Đóng camera"><X size={18} /></button>
      <div className="cam-stage">
        <motion.div layout className="viewfinder" style={{ aspectRatio: RATIOS[ratio] }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
          {shot ? <img src={shot.url} alt="Ảnh vừa chụp" /> : (
            <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} onLoadedMetadata={() => setReady(true)} />
          )}
          {count > 0 && !shot && <div className="countdown" key={count}>{count}</div>}
          {flash && <div className="flash" />}
          <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        </motion.div>
      </div>

      {shot ? (
        <div className="cam-review">
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Thêm tiêu đề cho ảnh (không bắt buộc)" aria-label="Tiêu đề" />
          <div className="row gap center">
            <button className="btn ghost" onClick={() => { setShot(null); setTitle(''); }} disabled={posting}><RotateCcw size={16} /> Chụp lại</button>
            <button className="btn primary" onClick={() => onPost(shot.file, title)} disabled={posting}>
              <Send size={16} /> {posting ? `Đang đăng ${Math.round((progress || 0) * 100)}%` : 'Đăng ngay'}
            </button>
          </div>
        </div>
      ) : (
        <div className="cam-controls">
          <div className="seg" role="group" aria-label="Tỉ lệ ảnh">
            {RATIO_KEYS.map((k) => <button key={k} className={ratio === k ? 'on' : ''} onClick={() => setRatio(k)}>{k}</button>)}
          </div>
          <button className="shutter" onClick={shutter} disabled={!ready || count > 0} aria-label="Chụp ảnh"><CamIcon size={26} /></button>
          <div className="row gap">
            <button className={`icon-btn ${timer ? 'on' : ''}`} onClick={() => setTimer((t) => !t)} aria-pressed={timer} aria-label="Hẹn giờ 3 giây" title="Hẹn giờ 3s"><Timer size={18} /></button>
            <button className="icon-btn" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Đổi camera" title="Đổi camera"><SwitchCamera size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
