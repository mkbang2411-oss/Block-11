import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BellOff,
  Check,
  Heart,
  MessageCircle,
  UserPlus,
  Bell,
  X,
} from "lucide-react";
import { api } from "../lib/api.js";
import { timeAgo } from "../lib/img.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";
import { Avatar } from "../components/Nav.jsx";

// Các tab: mỗi tab là một loại thông báo, có số chưa đọc riêng
const TABS = [
  {
    id: "all",
    label: "Tất cả",
    Icon: Bell,
    empty:
      "Khi bạn bè thả cảm xúc hay bình luận ảnh của bạn, mình sẽ báo ở đây nhé.",
  },
  {
    id: "comment",
    label: "Bình luận",
    Icon: MessageCircle,
    empty: "Chưa có ai bình luận ảnh của bạn.",
  },
  {
    id: "reaction",
    label: "Cảm xúc",
    Icon: Heart,
    empty: "Chưa có ai thả cảm xúc vào ảnh của bạn.",
  },
  {
    id: "friend",
    label: "Bạn bè",
    Icon: UserPlus,
    empty: "Chưa có lời mời kết bạn nào.",
  },
];

// Lời thông báo viết như người với người nói chuyện
function Line({ n }) {
  const name = <b>{n.actor.name}</b>;
  switch (n.type) {
    case "reaction":
      return (
        <>
          {name} đã thả {n.data?.emoji || "❤️"} vào ảnh của bạn
        </>
      );
    case "comment":
      return (
        <>
          {name} đã bình luận về ảnh của bạn
          {n.data?.body ? (
            <>
              : <i>“{n.data.body}”</i>
            </>
          ) : null}
        </>
      );
    case "friend_request":
      return <>{name} muốn kết bạn với bạn</>;
    case "friend_accepted":
      return <>{name} đã đồng ý kết bạn với bạn</>;
    default:
      return <>{name} vừa có hoạt động mới</>;
  }
}

export default function Notifications() {
  const { user, requireLogin, friends, refreshFriends, setUnread, toast } =
    useApp();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [counts, setCounts] = useState({
    all: 0,
    comment: 0,
    reaction: 0,
    friend: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const busy = useRef(false);
  const gen = useRef(0); // bỏ kết quả của tab cũ nếu người dùng đã chuyển tab

  const load = useCallback(
    async (kind, cursor) => {
      if (busy.current && cursor) return;
      const my = ++gen.current;
      busy.current = true;
      setLoadingMore(!!cursor);
      try {
        const r = await api.notifications(cursor, kind);
        if (my !== gen.current) return;
        setItems((l) => (cursor ? [...(l || []), ...r.items] : r.items));
        setNext(r.next);
        setCounts(r.unreadByKind || counts); // eslint-disable-line react-hooks/exhaustive-deps
        if (!cursor && (r.unreadByKind?.[kind] ?? r.unread) > 0) {
          // mở tab là coi như đã xem tab đó; vẫn giữ nền nổi bật cho tin mới trong lần mở này
          api
            .readAllNotifications(kind)
            .then((x) => {
              setUnread(x.unread);
            })
            .catch(() => {});
        }
      } catch (e) {
        if (my === gen.current) {
          if (!cursor) setItems([]);
          toast(e.message, "err");
        }
      }
      if (my === gen.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    },
    [setUnread, toast],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      busy.current = false;
      setItems(null);
      setNext(null);
      load(tab, null);
      refreshFriends();
    }
  }, [user, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sentinel.current || !next) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) load(tab, next);
      },
      { rootMargin: "300px" },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, load, tab, items?.length]);

  if (user === null)
    return (
      <div className="empty">
        <p className="display big">Thông báo của bạn</p>
        <p className="muted">
          Đăng nhập để xem bạn bè đã thả cảm xúc và bình luận gì nhé.
        </p>
        <button className="btn primary" onClick={() => requireLogin()}>
          Đăng nhập với Google
        </button>
      </div>
    );

  const open = (n) => {
    if (n.photo) navigate(`/album?focus=${n.photo.id}`);
    else navigate(`/album/${n.actor.id}`);
  };
  const pendingFor = (n) =>
    friends.incoming.find((r) => r.from.id === n.actor.id);
  const accept = async (n, req) => {
    try {
      await api.acceptFriend(req.requestId);
      toast(`Bạn và ${n.actor.name} đã là bạn bè ✦`);
      refreshFriends();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  const decline = async (req) => {
    try {
      await api.dropRequest(req.requestId);
      refreshFriends();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  const cur = TABS.find((t) => t.id === tab);
  // Lời mời đang chờ lấy thẳng từ danh sách bạn bè (kể cả khi người gửi mời trước lúc mình có tài khoản, lúc đó chưa có dòng thông báo nào)
  const showReqs =
    (tab === "all" || tab === "friend") && friends.incoming.length > 0;
  const rows = (items || []).filter(
    (n) => !(n.type === "friend_request" && pendingFor(n)),
  ); // dòng nào đã nằm trong khung lời mời thì không lặp lại
  const empty = items?.length === 0 && !showReqs;

  return (
    <div className="free-scroll scroll">
      <div className="free-col">
        <h1 className="free-title display">Thông báo</h1>
        <div className="seg" role="tablist" aria-label="Loại thông báo">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`seg-btn ${tab === id ? "on" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} /> <span>{label}</span>
              {(() => {
                const c =
                  id === "friend"
                    ? Math.max(counts.friend, friends.incoming.length)
                    : counts[id];
                return c > 0 && tab !== id ? (
                  <i className="seg-badge">{c > 9 ? "9+" : c}</i>
                ) : null;
              })()}
            </button>
          ))}
        </div>
        {showReqs && (
          <section className="req-box" aria-label="Lời mời kết bạn">
            <h3 className="display">
              <UserPlus size={17} /> Lời mời kết bạn{" "}
              <small>{friends.incoming.length}</small>
            </h3>
            <ul className="notif-list">
              {friends.incoming.map((r) => (
                <li key={r.requestId} className="notif new">
                  <button
                    className="notif-main"
                    onClick={() => navigate(`/album/${r.from.id}`)}
                  >
                    <Avatar user={r.from} size={44} />
                    <span className="notif-text">
                      <span>
                        <b>{r.from.name}</b> muốn kết bạn với bạn
                      </span>
                      <small>{r.from.email}</small>
                    </span>
                  </button>
                  <button
                    className="btn primary sm"
                    onClick={() => accept({ actor: r.from }, r)}
                  >
                    <Check size={14} /> Đồng ý
                  </button>
                  <button
                    className="icon-btn sm"
                    onClick={() => decline(r)}
                    aria-label="Từ chối"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {items === null && (
          <div className="loading-dots">
            <i />
            <i />
            <i />
          </div>
        )}
        {empty && (
          <div className="empty inline">
            <BellOff size={34} className="muted" />
            <p className="display big">Chưa có thông báo nào</p>
            <p className="muted">{cur.empty}</p>
          </div>
        )}
        <ul className="notif-list">
          {rows.map((n, i) => {
            const req = null;
            return (
              <motion.li
                key={n.id}
                className={`notif ${n.read ? "" : "new"}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
              >
                <button className="notif-main" onClick={() => open(n)}>
                  <Avatar user={n.actor} size={44} />
                  <span className="notif-text">
                    <span>
                      <Line n={n} />
                    </span>
                    <small>{timeAgo(n.createdAt)}</small>
                  </span>
                  {n.photo?.thumbUrl && (
                    <img
                      className="notif-thumb"
                      src={n.photo.thumbUrl}
                      alt=""
                      loading="lazy"
                    />
                  )}
                </button>
                {req && (
                  <button
                    className="btn primary sm"
                    onClick={() => accept(n, req)}
                  >
                    <Check size={14} /> Đồng ý
                  </button>
                )}
              </motion.li>
            );
          })}
        </ul>
        <div ref={sentinel} className="sentinel">
          {loadingMore && (
            <div className="loading-dots">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
