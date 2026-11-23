import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BellOff, Check } from 'lucide-react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/img.js';
import { navigate } from '../lib/router.js';
import { useApp } from '../store.jsx';
import { Avatar } from '../components/Nav.jsx';

// Lời thông báo viết như người với người nói chuyện
function Line({ n }) {
  const name = <b>{n.actor.name}</b>;
  switch (n.type) {
    case 'reaction': return <>{name} đã thả {n.data?.emoji || '❤️'} vào ảnh của bạn</>;
    case 'comment': return <>{name} đã bình luận về ảnh của bạn{n.data?.body ? <>: <i>“{n.data.body}”</i></> : null}</>;
    case 'friend_request': return <>{name} muốn kết bạn với bạn</>;
    case 'friend_accepted': return <>{name} đã đồng ý kết bạn với bạn</>;
    default: return <>{name} vừa có hoạt động mới</>;
  }
}

export default function Notifications() {
  const { user, requireLogin, friends, refreshFriends, setUnread, toast } = useApp();
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const busy = useRef(false);

  const load = useCallback(async (cursor) => {
    if (busy.current) return;
    busy.current = true; setLoadingMore(!!cursor);
    try {
      const r = await api.notifications(cursor);
      setItems((l) => (cursor ? [...(l || []), ...r.items] : r.items));
      setNext(r.next);
      if (!cursor && r.unread > 0) { // mở trang là coi như đã xem; giữ nền nổi bật cho tin mới trong lần mở này
        api.readAllNotifications().then(() => setUnread(0)).catch(() => {});
      }
    } catch (e) { if (!cursor) setItems([]); toast(e.message, 'err'); }
    busy.current = false; setLoadingMore(false);
  }, [setUnread, toast]);

  useEffect(() => { if (user) { setItems(null); load(null); refreshFriends(); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sentinel.current || !next) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) load(next); }, { rootMargin: '300px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, load, items?.length]);

  if (user === null) return (
    <div className="empty"><p className="display big">Thông báo của bạn</p><p className="muted">Đăng nhập để xem bạn bè đã thả cảm xúc và bình luận gì nhé.</p><button className="btn primary" onClick={() => requireLogin()}>Đăng nhập với Google</button></div>
  );

  const open = (n) => {
    if (n.photo) navigate(`/album?focus=${n.photo.id}`);
    else if (n.type === 'friend_request') navigate('/me');
    else navigate(`/album/${n.actor.id}`);
  };
  const pendingFor = (n) => friends.incoming.find((r) => r.from.id === n.actor.id);
  const accept = async (n, req) => {
    try { await api.acceptFriend(req.requestId); toast(`Bạn và ${n.actor.name} đã là bạn bè ✦`); refreshFriends(); }
    catch (e) { toast(e.message, 'err'); }
  };

  return (
    <div className="free-scroll scroll">
      <div className="free-col">
        <h1 className="free-title display">Thông báo</h1>
        {items === null && <div className="loading-dots"><i /><i /><i /></div>}
        {items?.length === 0 && (
          <div className="empty inline"><BellOff size={34} className="muted" /><p className="display big">Chưa có thông báo nào</p><p className="muted">Khi bạn bè thả cảm xúc hay bình luận ảnh của bạn, mình sẽ báo ở đây nhé.</p></div>
        )}
        <ul className="notif-list">
          {items?.map((n, i) => {
            const req = n.type === 'friend_request' ? pendingFor(n) : null;
            return (
              <motion.li key={n.id} className={`notif ${n.read ? '' : 'new'}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                <button className="notif-main" onClick={() => open(n)}>
                  <Avatar user={n.actor} size={44} />
                  <span className="notif-text"><span><Line n={n} /></span><small>{timeAgo(n.createdAt)}</small></span>
                  {n.photo?.thumbUrl && <img className="notif-thumb" src={n.photo.thumbUrl} alt="" loading="lazy" />}
                </button>
                {req && <button className="btn primary sm" onClick={() => accept(n, req)}><Check size={14} /> Đồng ý</button>}
              </motion.li>
            );
          })}
        </ul>
        <div ref={sentinel} className="sentinel">{loadingMore && <div className="loading-dots"><i /><i /><i /></div>}</div>
      </div>
    </div>
  );
}
