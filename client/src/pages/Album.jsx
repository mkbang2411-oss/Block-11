import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { api } from '../lib/api.js';
import { useElementSize } from '../lib/hooks.js';
import { navigate } from '../lib/router.js';
import { useApp } from '../store.jsx';
import { Avatar } from '../components/Nav.jsx';
import PhotoImg from '../components/PhotoImg.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';

const COLS = 2, ROWS = 3, PER = COLS * ROWS, GAP = 10, PAD = 14, SPINE = 18;
const tilt = (slot) => (((slot * 37) % 7) - 3) * 0.35; // nghiêng nhẹ từng ô, ổn định theo vị trí

/* Nội dung một ô (luôn khung 3:4):
   3:4 -> phủ kín · 1:1 -> giữ nguyên, nằm giữa ô · 4:3 -> xoay 90° để phủ kín (mở ra sẽ xoay về 4:3 như gốc). */
function CardBody({ p, cell }) {
  const sizes = `${Math.round(cell.h)}px`;
  if (p.aspect === '4:3') {
    return (
      <span className="rot" style={{ width: cell.h - 12, height: cell.w - 12 }}>
        <PhotoImg photo={p} sizes={sizes} className="ph fill" />
      </span>
    );
  }
  return <PhotoImg photo={p} sizes={`${Math.round(cell.w)}px`} className={`ph ${p.aspect === '1:1' ? 'sq' : 'fill'}`} />;
}

export default function Album({ userId, search }) {
  const { user, requireLogin } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const [open, setOpen] = useState(null);
  const [drag, setDrag] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const [areaRef, size] = useElementSize();
  const { toast } = useApp();

  /* ---- Tải album (của mình hoặc của bạn) ---- */
  useEffect(() => {
    if (!user) return undefined;
    let dead = false; setData(null); setError('');
    api.album(userId).then((r) => {
      if (dead) return;
      setData(r);
      const newIds = (search.get('new') || '').split(',').filter(Boolean);
      const focus = search.get('focus');
      const target = r.photos.find((p) => p.id === (newIds[0] || focus));
      setPage(target ? Math.floor(target.slot / PER) : r.startPage); // mặc định: trang chứa ảnh đăng gần nhất
      if (newIds.length) { setFresh(new Set(newIds)); setTimeout(() => setFresh(new Set()), 3500); }
      if (focus && target) setTimeout(() => setOpen(target.id), 700);
    }).catch((e) => !dead && setError(e.message));
    return () => { dead = true; };
  }, [userId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = data?.photos || [];
  const isMine = !!data?.isMine;
  const bySlot = useMemo(() => new Map(photos.map((p) => [p.slot, p])), [photos]);
  const ordered = useMemo(() => [...photos].sort((a, b) => a.slot - b.slot), [photos]);

  /* ---- Bố cục cuốn album ---- */
  const pps = size.w >= 760 ? 2 : 1; // số trang hiển thị cùng lúc
  const maxSlot = photos.reduce((m, p) => Math.max(m, p.slot), -1);
  let pageCount = Math.max(pps, Math.ceil((maxSlot + 1) / PER) + (isMine ? 1 : 0));
  pageCount = Math.ceil(pageCount / pps) * pps;
  const first = page - (page % pps);
  const areaH = size.h - 64;
  const cellH0 = (areaH - 2 * PAD - (ROWS - 1) * GAP) / ROWS;
  const cellWmax = (size.w - 24 - (pps - 1) * SPINE - pps * (2 * PAD + (COLS - 1) * GAP)) / (pps * COLS);
  const cw = Math.max(40, Math.floor(Math.min(cellH0 * 0.75, cellWmax)));
  const cell = { w: cw, h: Math.round((cw * 4) / 3) };
  const ready = size.w > 0 && size.h > 120;

  const go = useCallback((to) => {
    const t = Math.max(0, Math.min(pageCount - pps, to - (to % pps)));
    setPage((cur) => { if (t !== cur - (cur % pps)) setDir(t > cur ? 1 : -1); return t; });
  }, [pageCount, pps]);

  useEffect(() => {
    const on = (e) => {
      if (open || drag || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') go(first - pps);
      if (e.key === 'ArrowRight') go(first + pps);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, drag, first, pps, go]);

  /* ---- Kéo thả đổi ô (pointer events: chuột + cảm ứng) ---- */
  const live = useRef({});
  live.current = { photos, bySlot, first, pps, go, isMine };
  const st = useRef(null);
  const edge = useRef({ side: 0, t: null });
  const suppress = useRef(false);

  const reorder = useCallback(async (p, target) => {
    const { bySlot: m } = live.current;
    const occ = m.get(target);
    const moves = [{ id: p.id, slot: target }, ...(occ && occ.id !== p.id ? [{ id: occ.id, slot: p.slot }] : [])];
    const prev = live.current.photos;
    setData((d) => ({ ...d, photos: d.photos.map((x) => { const mv = moves.find((y) => y.id === x.id); return mv ? { ...x, slot: mv.slot } : x; }) }));
    try { await api.reorder(moves); }
    catch (e) { setData((d) => ({ ...d, photos: prev })); toast(e.message, 'err'); }
  }, [toast]);

  const stopDrag = useCallback(() => {
    window.removeEventListener('pointermove', onMoveRef.current);
    window.removeEventListener('pointerup', onUpRef.current);
    window.removeEventListener('pointercancel', onUpRef.current);
    clearTimeout(edge.current.t); edge.current = { side: 0, t: null };
    if (st.current) clearTimeout(st.current.timer);
    st.current = null; setDrag(null);
  }, []);

  const onMoveRef = useRef(); const onUpRef = useRef();
  onMoveRef.current = (e) => {
    const s = st.current; if (!s) return;
    const dist = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
    if (!s.active) {
      if (s.touch) { if (dist > 10) stopDrag(); return; } // cảm ứng: chưa giữ đủ lâu mà đã di chuyển -> không phải kéo
      if (dist < 6) return;
      s.active = true;
    }
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
    setDrag({ id: s.p.id, x: e.clientX, y: e.clientY, ox: s.ox, oy: s.oy, w: s.w, h: s.h, over: over ? Number(over.dataset.slot) : null });
    // Kéo sát mép -> lật trang sau một nhịp
    const r = areaRef.current?.getBoundingClientRect();
    const side = r ? (e.clientX < r.left + 56 ? -1 : e.clientX > r.right - 56 ? 1 : 0) : 0;
    if (side !== edge.current.side) {
      clearTimeout(edge.current.t);
      edge.current = { side, t: side ? setTimeout(function flip() {
        const L = live.current; L.go(L.first + side * L.pps);
        edge.current.t = setTimeout(flip, 900);
      }, 650) : null };
    }
  };
  onUpRef.current = (e) => {
    const s = st.current;
    if (s?.active) {
      suppress.current = true; setTimeout(() => { suppress.current = false; }, 60);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
      const target = over ? Number(over.dataset.slot) : null;
      if (target !== null && target !== s.p.slot) reorder(s.p, target);
    }
    stopDrag();
  };

  const onDown = (p) => (e) => {
    if (!live.current.isMine || (e.pointerType === 'mouse' && e.button !== 0) || st.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = { p, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, h: r.height, active: false, touch: e.pointerType !== 'mouse', timer: null };
    if (s.touch) s.timer = setTimeout(() => { s.active = true; setDrag({ id: p.id, x: s.sx, y: s.sy, ox: s.ox, oy: s.oy, w: s.w, h: s.h, over: p.slot }); navigator.vibrate?.(12); }, 260);
    st.current = s;
    window.addEventListener('pointermove', onMoveRef.current);
    window.addEventListener('pointerup', onUpRef.current);
    window.addEventListener('pointercancel', onUpRef.current);
  };
  useEffect(() => stopDrag, [stopDrag]);

  const update = useCallback((np) => setData((d) => ({ ...d, photos: d.photos.map((x) => (x.id === np.id ? { ...x, ...np } : x)) })), []);
  const removed = useCallback((id) => setData((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== id) })), []);

  /* ---- Trạng thái đặc biệt ---- */
  if (user === null) return (
    <div className="empty"><p className="display big">Cuốn album của bạn</p><p className="muted">Đăng nhập để xem và sắp xếp ảnh của bạn.</p><button className="btn primary" onClick={() => requireLogin()}>Đăng nhập với Google</button></div>
  );
  if (error) return (
    <div className="empty"><p className="display big">Không mở được album</p><p className="muted">{error}</p><button className="btn ghost" onClick={() => navigate('/feed')}>Về trang bạn bè</button></div>
  );

  const firstEmpty = isMine ? (() => { let s = 0; while (bySlot.has(s)) s++; return s; })() : -1;
  const draggingPhoto = drag && photos.find((p) => p.id === drag.id);
  const pages = Array.from({ length: pps }, (_, i) => first + i);

  return (
    <div className="album" ref={areaRef}>
      {!isMine && data && (
        <div className="album-owner">
          <button className="icon-btn sm" onClick={() => navigate('/feed')} aria-label="Về trang bạn bè"><ArrowLeft size={16} /></button>
          <Avatar user={data.owner} size={26} /> <span>Album của <b>{data.owner.name}</b></span>
        </div>
      )}
      {!data && <div className="loading-dots center-abs"><i /><i /><i /></div>}

      {data && ready && (
        <>
          <div className="book-wrap">
            <button className="page-btn left" onClick={() => go(first - pps)} disabled={first === 0} aria-label="Trang trước"><ChevronLeft size={22} /></button>
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div key={first} className="book" custom={dir}
                variants={{ enter: (d) => ({ opacity: 0, rotateY: d * 26, x: d * 46 }), center: { opacity: 1, rotateY: 0, x: 0 }, exit: (d) => ({ opacity: 0, rotateY: -d * 26, x: -d * 46 }) }}
                initial="enter" animate="center" exit="exit" transition={{ duration: 0.26, ease: [0.3, 0.7, 0.3, 1] }}>
                {pages.map((pi, i) => (
                  <div key={pi} className="sheet" style={{ padding: PAD, gap: GAP, gridTemplateColumns: `repeat(${COLS}, ${cell.w}px)`, gridTemplateRows: `repeat(${ROWS}, ${cell.h}px)`, marginLeft: i ? SPINE : 0 }}>
                    {Array.from({ length: PER }, (_, k) => {
                      const slot = pi * PER + k; const p = bySlot.get(slot);
                      return (
                        <div key={slot} className={`slot ${drag?.over === slot ? 'hover' : ''} ${drag ? 'dropping' : ''}`} data-slot={slot}>
                          {p ? (
                            <motion.button className={`card ${drag?.id === p.id ? 'lifted' : ''} ${fresh.has(p.id) ? 'fresh' : ''} ${isMine ? 'can-drag' : ''}`}
                              data-photo-id={p.id} data-rotated={p.aspect === '4:3' ? '1' : '0'} style={{ rotate: tilt(slot) }}
                              initial={fresh.has(p.id) ? { scale: 0.2, opacity: 0, rotate: -18 } : false} animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 240, damping: 15, delay: fresh.has(p.id) ? 0.4 : 0 }}
                              onPointerDown={onDown(p)} onClick={() => { if (!suppress.current) setOpen(p.id); }}
                              aria-label={`Ảnh ${p.title || 'chưa có tiêu đề'}${isMine ? '. Giữ và kéo để đổi ô' : ''}`}>
                              <CardBody p={p} cell={cell} />
                              {p.commentCount > 0 && <span className="cmt-dot" aria-hidden="true">{p.commentCount}</span>}
                            </motion.button>
                          ) : slot === firstEmpty ? (
                            <button className="add-slot" onClick={() => navigate('/')} aria-label="Thêm ảnh mới"><Plus size={22} /></button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {pps === 2 && <div className="spine" aria-hidden="true" />}
              </motion.div>
            </AnimatePresence>
            <button className="page-btn right" onClick={() => go(first + pps)} disabled={first + pps >= pageCount} aria-label="Trang sau"><ChevronRight size={22} /></button>
          </div>

          <div className="album-foot">
            <span className="pixel">trang {first + 1}{pps === 2 ? `–${first + 2}` : ''} / {pageCount}</span>
            <div className="dots">{Array.from({ length: pageCount / pps }, (_, i) => (
              <button key={i} className={i * pps === first ? 'on' : ''} onClick={() => go(i * pps)} aria-label={`Tới trang ${i * pps + 1}`} />
            ))}</div>
            {isMine && <span className="muted hint">Giữ và kéo ảnh để đổi ô</span>}
          </div>

          {!photos.length && isMine && (
            <div className="album-empty"><p className="display">Album còn trống ✦</p><p className="muted">Mỗi ảnh bạn đăng sẽ nằm vào một khe ở đây.</p></div>
          )}
        </>
      )}

      {drag && draggingPhoto && createPortal(
        <div className="ghost" style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w, height: drag.h }}>
          <div className="card"><CardBody p={draggingPhoto} cell={cell} /></div>
        </div>, document.body)}

      {open && <PhotoViewer photos={ordered} startId={open} isMine={isMine} onClose={() => setOpen(null)} onUpdate={update} onDeleted={removed} />}
    </div>
  );
}
