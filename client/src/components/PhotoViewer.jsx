import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, MessageCircle, Pencil, Send, Trash2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/img.js';
import { navigate } from '../lib/router.js';
import { prefersReducedMotion, useEscape } from '../lib/hooks.js';
import { useApp } from '../store.jsx';
import { Avatar } from './Nav.jsx';
import PhotoImg from './PhotoImg.jsx';
import Reactions from './Reactions.jsx';
import EditorModal from './EditorModal.jsx';

const EASE = 'cubic-bezier(.2,.9,.25,1.08)';
const originEl = (id) => document.querySelector(`[data-photo-id="${id}"]`);

// FLIP: transform đưa phần tử đích về đúng vị trí/kích thước/góc xoay của ô nguồn (ô album 4:3 đang xoay 90°)
function fromTransform(src, dst) {
  const rotated = src.dataset.rotated === '1';
  const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
  const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
  const s = rotated ? a.height / b.width : a.width / b.width;
  return `translate(${dx}px, ${dy}px) rotate(${rotated ? 90 : 0}deg) scale(${s})`;
}

export default function PhotoViewer({ photos, startId, isMine, onClose, onUpdate, onDeleted }) {
  const { user, toast } = useApp();
  const [id, setId] = useState(startId);
  const photo = photos.find((p) => p.id === id);
  const idx = photos.findIndex((p) => p.id === id);
  const card = useRef(null);
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [title, setTitle] = useState(photo?.title || '');
  const opened = useRef(false);

  // Mở: morph từ ô nguồn
  useLayoutEffect(() => {
    if (opened.current || !card.current) return;
    opened.current = true;
    const src = originEl(startId);
    if (!src || prefersReducedMotion() || !card.current.animate) return;
    card.current.animate([{ transform: fromTransform(src, card.current), opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: EASE });
  }, [startId]);

  const close = useCallback(() => {
    if (closing) return;
    const src = originEl(id);
    if (!src || !card.current?.animate || prefersReducedMotion()) { onClose(); return; }
    setClosing(true);
    const a = card.current.animate([{ transform: 'none', opacity: 1 }, { transform: fromTransform(src, card.current), opacity: 0.4 }], { duration: 320, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' });
    a.onfinish = onClose;
  }, [closing, id, onClose]);
  useEscape(close, !editing && !confirmDel);

  useEffect(() => { setTitle(photo?.title || ''); setComments(null); setText(''); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!photo) return undefined;
    let dead = false;
    api.comments(photo.id).then((r) => { if (!dead) setComments(r.comments); }).catch(() => { if (!dead) setComments([]); });
    return () => { dead = true; };
  }, [photo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e) => {
      if (editing || confirmDel || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && idx > 0) setId(photos[idx - 1].id);
      if (e.key === 'ArrowRight' && idx < photos.length - 1) setId(photos[idx + 1].id);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [idx, photos, editing, confirmDel]);

  if (!photo) return null;
  const owner = photo.owner;

  const saveTitle = async () => {
    const t = title.trim();
    if (t === photo.title) return;
    try { onUpdate((await api.patchPhoto(photo.id, { title: t })).photo); } catch (e) { toast(e.message, 'err'); }
  };
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim(); if (!body || busy) return;
    setBusy(true);
    try {
      const r = await api.addComment(photo.id, body);
      setComments((c) => [...(c || []), r.comment]); setText('');
      onUpdate({ ...photo, commentCount: photo.commentCount + 1 });
    } catch (x) { toast(x.message, 'err'); }
    setBusy(false);
  };
  const delComment = async (c) => {
    try {
      await api.deleteComment(c.id);
      setComments((l) => l.filter((x) => x.id !== c.id));
      onUpdate({ ...photo, commentCount: Math.max(0, photo.commentCount - 1) });
    } catch (x) { toast(x.message, 'err'); }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api.deletePhoto(photo.id);
      toast('Đã xóa ảnh khỏi album');
      const next = photos[idx + 1] || photos[idx - 1];
      onDeleted(photo.id);
      if (next) { setConfirmDel(false); setId(next.id); } else onClose();
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false); setConfirmDel(false);
  };

  const rotatedNote = isMine && photo.aspect === '4:3';
  return createPortal(
    <div className={`overlay viewer-overlay ${closing ? 'closing' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <button className="icon-btn viewer-close" onClick={close} aria-label="Đóng ảnh"><X size={20} /></button>
      {idx > 0 && <button className="icon-btn nav-arrow left" onClick={() => setId(photos[idx - 1].id)} aria-label="Ảnh trước"><ChevronLeft size={22} /></button>}
      {idx < photos.length - 1 && <button className="icon-btn nav-arrow right" onClick={() => setId(photos[idx + 1].id)} aria-label="Ảnh sau"><ChevronRight size={22} /></button>}

      <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.title || 'Xem ảnh'}>
        <div className="viewer-media">
          <figure className={`viewer-card a-${photo.aspect.replace(':', 'x')}`} ref={card} key={photo.id}>
            <PhotoImg photo={photo} eager sizes="(max-width: 860px) 92vw, 62vw" />
          </figure>
          {rotatedNote && <p className="hint-rot">Ảnh ngang được xoay dọc trong album, mở ra là về đúng chiều gốc ✦</p>}
        </div>

        <aside className="viewer-side">
          <header className="viewer-owner">
            <button className="who" onClick={() => owner && !isMine && (close(), navigate(`/album/${owner.id}`))} disabled={isMine} title={isMine ? '' : 'Xem album'}>
              <Avatar user={owner} size={36} /> <span><b>{owner?.name}</b><small>{timeAgo(photo.createdAt)}{photo.edited ? ' · đã chỉnh sửa' : ''}</small></span>
            </button>
          </header>

          {isMine ? (
            <input className="title-input" value={title} maxLength={120} placeholder="Thêm tiêu đề…" aria-label="Tiêu đề ảnh"
              onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          ) : photo.title && <h3 className="viewer-title display">{photo.title}</h3>}

          <Reactions photo={photo} onChange={onUpdate} />

          <div className="actions">
            <a className="btn ghost" href={api.downloadUrl(photo.id)} download><Download size={16} /> Tải về</a>
            {isMine && <button className="btn ghost" onClick={() => setEditing(true)}><Pencil size={16} /> Chỉnh sửa</button>}
            {isMine && <button className="btn ghost danger" onClick={() => setConfirmDel(true)}><Trash2 size={16} /> Xóa</button>}
          </div>

          <section className="comments" aria-label="Bình luận">
            <h4><MessageCircle size={15} /> Bình luận {photo.commentCount > 0 && <small>{photo.commentCount}</small>}</h4>
            <ul>
              {comments === null && <li className="muted">Đang tải…</li>}
              {comments?.length === 0 && <li className="muted">Chưa có bình luận nào. Viết lời đầu tiên nhé!</li>}
              {comments?.map((c) => (
                <li key={c.id}>
                  <Avatar user={c.author} size={26} />
                  <div><b>{c.author.name}</b> <small>{timeAgo(c.createdAt)}</small><p>{c.body}</p></div>
                  {c.canDelete && <button className="icon-btn sm" onClick={() => delComment(c)} aria-label="Xóa bình luận"><X size={13} /></button>}
                </li>
              ))}
            </ul>
            <form onSubmit={send} className="comment-form">
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={user ? 'Viết bình luận…' : 'Đăng nhập để bình luận'} aria-label="Viết bình luận" />
              <button className="icon-btn on" disabled={!text.trim() || busy} aria-label="Gửi"><Send size={16} /></button>
            </form>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {editing && <EditorModal key="ed" photo={photo} onClose={() => setEditing(false)} onSaved={(p) => { onUpdate(p); setEditing(false); }} />}
        {confirmDel && (
          <div className="overlay confirm" key="del" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(false)}>
            <div className="modal small" role="alertdialog" aria-label="Xóa ảnh">
              <div className="modal-body center">
                <p className="display big">Xóa ảnh này?</p>
                <p className="muted">Ảnh sẽ biến mất khỏi album của bạn và của bạn bè. Không hoàn tác được.</p>
                <div className="row gap"><button className="btn ghost" onClick={() => setConfirmDel(false)}>Giữ lại</button><button className="btn danger" onClick={remove} disabled={busy}>Xóa ảnh</button></div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
