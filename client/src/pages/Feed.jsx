import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, UserPlus } from "lucide-react";
import { api } from "../lib/api.js";
import { timeAgo } from "../lib/img.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";
import { Avatar } from "../components/Nav.jsx";
import PhotoImg from "../components/PhotoImg.jsx";
import Reactions from "../components/Reactions.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";

export default function Feed() {
  const { user, friends, requireLogin } = useApp();
  const [photos, setPhotos] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(null);
  const sentinel = useRef(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (cursor) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const r = await api.feed(cursor);
      setPhotos((l) =>
        cursor
          ? [...l, ...r.photos.filter((p) => !l.some((x) => x.id === p.id))]
          : r.photos,
      );
      setNext(r.next);
      setDone(!r.next);
    } catch {
      setDone(true);
    }
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user) {
      setPhotos([]);
      setDone(false);
      load(null);
    }
  }, [user, load]);
  useEffect(() => {
    if (!sentinel.current || done || !next) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) load(next);
      },
      { rootMargin: "400px" },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, done, load, photos.length]);

  const update = useCallback(
    (p) => setPhotos((l) => l.map((x) => (x.id === p.id ? { ...x, ...p } : x))),
    [],
  );

  if (user === null)
    return (
      <div className="empty">
        <p className="display big">Xem ảnh của bạn bè</p>
        <p className="muted">Đăng nhập để lướt những khoảnh khắc mới nhất.</p>
        <button className="btn primary" onClick={() => requireLogin()}>
          Đăng nhập với Google
        </button>
      </div>
    );

  return (
    <div className="free-scroll scroll">
      <div className="free-col feed">
        <div className="friend-strip" aria-label="Bạn bè">
          <button
            className="strip-item add"
            onClick={() => navigate("/me")}
            aria-label="Thêm bạn bằng Gmail"
          >
            <span className="avatar add-av">
              <UserPlus size={18} />
            </span>
            <small>Thêm bạn</small>
          </button>
          {friends.friends.map((f) => (
            <button
              key={f.id}
              className="strip-item"
              onClick={() => navigate(`/album/${f.id}`)}
              title={`Album của ${f.name}`}
            >
              <Avatar user={f} size={52} ring={!!f.latestPhotoAt} />
              <small>{f.name.split(" ").slice(-1)[0]}</small>
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {photos.map((p) => (
            <motion.article
              key={p.id}
              className="feed-card"
              layout="position"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
            >
              <header>
                <button
                  className="who"
                  onClick={() =>
                    navigate(
                      p.owner.id === user.id
                        ? "/album"
                        : `/album/${p.owner.id}?focus=${p.id}`,
                    )
                  }
                >
                  <Avatar user={p.owner} size={38} ring />
                  <span>
                    <b>{p.owner.id === user.id ? "Bạn" : p.owner.name}</b>
                    <small>{timeAgo(p.createdAt)}</small>
                  </span>
                </button>
              </header>
              <button
                className={`feed-photo a-${p.aspect.replace(":", "x")}`}
                data-photo-id={p.id}
                onClick={() => setOpen(p.id)}
                aria-label={`Mở ảnh ${p.title || ""}`}
              >
                <PhotoImg photo={p} sizes="(max-width: 600px) 92vw, 520px" />
              </button>
              {p.title && <p className="feed-title display">{p.title}</p>}
              <footer>
                <Reactions photo={p} onChange={update} compact />
                <button className="cmt" onClick={() => setOpen(p.id)}>
                  <MessageCircle size={17} /> {p.commentCount || ""}
                </button>
              </footer>
            </motion.article>
          ))}
        </AnimatePresence>

        {!loading && !photos.length && done && (
          <div className="empty inline">
            <p className="display big">Chưa có ảnh nào ✦</p>
            <p className="muted">
              Kết bạn bằng địa chỉ Gmail để thấy ảnh của họ ở đây, hoặc đăng tấm
              đầu tiên của bạn.
            </p>
            <div className="row gap center">
              <button className="btn primary" onClick={() => navigate("/me")}>
                Thêm bạn
              </button>
              <button className="btn ghost" onClick={() => navigate("/")}>
                Đăng ảnh
              </button>
            </div>
          </div>
        )}
        <div ref={sentinel} className="sentinel">
          {loading && (
            <div className="loading-dots">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>

        {open && (
          <PhotoViewer
            photos={photos}
            startId={open}
            isMine={false}
            onClose={() => setOpen(null)}
            onUpdate={update}
            onDeleted={() => {}}
          />
        )}
      </div>
    </div>
  );
}
