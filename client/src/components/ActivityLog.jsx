import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Heart,
  ImagePlus,
  MessageCircle,
  Pencil,
  Trash2,
  Type,
  UserCheck,
  UserMinus,
  UserPlus,
  History,
} from "lucide-react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "photo", label: "Ảnh" },
  { id: "social", label: "Bình luận & cảm xúc" },
  { id: "friend", label: "Bạn bè" },
  { id: "account", label: "Tài khoản" },
];

const ICON = {
  photo_upload: ImagePlus,
  photo_edit: Pencil,
  photo_delete: Trash2,
  react: Heart,
  comment: MessageCircle,
  friend_request: UserPlus,
  friend_added: UserCheck,
  unfriend: UserMinus,
  avatar: Camera,
  rename: Type,
};

function Text({ a }) {
  const d = a.data || {};
  const owner = a.photo ? (
    a.photo.mine ? (
      "ảnh của bạn"
    ) : (
      <>
        ảnh của <b>{a.photo.ownerName}</b>
      </>
    )
  ) : (
    "một ảnh"
  );
  switch (a.type) {
    case "photo_upload":
      return (
        <>
          Bạn đã đăng một ảnh mới
          {d.title ? (
            <>
              : <i>“{d.title}”</i>
            </>
          ) : null}
        </>
      );
    case "photo_edit":
      return (
        <>
          {d.restore ? "Bạn đã khôi phục ảnh gốc" : "Bạn đã chỉnh sửa một ảnh"}
        </>
      );
    case "photo_delete":
      return (
        <>
          Bạn đã xóa một ảnh
          {d.title ? (
            <>
              : <i>“{d.title}”</i>
            </>
          ) : null}
        </>
      );
    case "react":
      return (
        <>
          Bạn đã thả {d.emoji || "❤️"} vào {owner}
        </>
      );
    case "comment":
      return (
        <>
          Bạn đã bình luận ở {owner}
          {d.body ? (
            <>
              : <i>“{d.body}”</i>
            </>
          ) : null}
        </>
      );
    case "friend_request":
      return (
        <>
          Bạn đã gửi lời mời kết bạn tới <b>{d.name || d.email}</b>
        </>
      );
    case "friend_added":
      return (
        <>
          Bạn và <b>{d.name || "một người bạn"}</b> đã trở thành bạn bè
        </>
      );
    case "unfriend":
      return (
        <>
          Bạn đã hủy kết bạn với <b>{d.name || "một người"}</b>
        </>
      );
    case "avatar":
      return (
        <>
          {d.reset
            ? "Bạn đã dùng lại ảnh Google làm avatar"
            : "Bạn đã đổi ảnh đại diện"}
        </>
      );
    case "rename":
      return (
        <>
          Bạn đã đổi tên từ <b>{d.from}</b> thành <b>{d.to}</b>
        </>
      );
    default:
      return <>Hoạt động mới</>;
  }
}

const dayKey = (ts) => new Date(ts).toDateString();
function dayLabel(ts) {
  const t = new Date(),
    y = new Date(Date.now() - 864e5);
  if (dayKey(ts) === t.toDateString()) return "Hôm nay";
  if (dayKey(ts) === y.toDateString()) return "Hôm qua";
  return new Date(ts).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}
const hhmm = (ts) =>
  new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ActivityLog() {
  const { toast } = useApp();
  const [kind, setKind] = useState("all");
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const gen = useRef(0);

  const load = useCallback(
    async (k, cursor) => {
      const my = ++gen.current;
      setLoadingMore(!!cursor);
      try {
        const r = await api.activity(cursor, k);
        if (my !== gen.current) return;
        setItems((l) => (cursor ? [...(l || []), ...r.items] : r.items));
        setNext(r.next);
      } catch (e) {
        if (my === gen.current) {
          if (!cursor) setItems([]);
          toast(e.message, "err");
        }
      }
      if (my === gen.current) setLoadingMore(false);
    },
    [toast],
  );

  useEffect(() => {
    setItems(null);
    setNext(null);
    load(kind, null);
  }, [kind, load]);
  useEffect(() => {
    if (!sentinel.current || !next) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loadingMore) load(kind, next);
      },
      { rootMargin: "300px" },
    );
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [next, kind, load, loadingMore, items?.length]);

  const open = (a) => {
    if (a.photo)
      navigate(
        a.photo.mine
          ? `/album?focus=${a.photo.id}`
          : `/album/${a.photo.ownerId}?focus=${a.photo.id}`,
      );
    else if (a.type === "friend_added" && a.data?.userId)
      navigate(`/album/${a.data.userId}`);
  };
  const clickable = (a) =>
    !!a.photo || (a.type === "friend_added" && a.data?.userId);

  // gom theo ngày
  const groups = [];
  items?.forEach((a) => {
    const k = dayKey(a.createdAt);
    if (!groups.length || groups[groups.length - 1].k !== k)
      groups.push({ k, label: dayLabel(a.createdAt), list: [] });
    groups[groups.length - 1].list.push(a);
  });

  return (
    <div className="activity">
      <div className="chips" role="group" aria-label="Lọc nhật ký">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`fchip ${kind === f.id ? "on" : ""}`}
            onClick={() => setKind(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {items === null && (
        <div className="loading-dots">
          <i />
          <i />
          <i />
        </div>
      )}
      {items?.length === 0 && (
        <div className="empty inline">
          <History size={32} className="muted" />
          <p className="display big">Chưa có hoạt động nào</p>
          <p className="muted">
            Đăng ảnh, bình luận hay kết bạn xong, mọi thứ sẽ được ghi lại ở đây.
          </p>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.k} className="act-day">
          <h4>{g.label}</h4>
          <ul className="act-list">
            {g.list.map((a) => {
              const Ico = ICON[a.type] || History;
              const Tag = clickable(a) ? "button" : "div";
              return (
                <li key={a.id}>
                  <Tag
                    className={`act ${clickable(a) ? "link" : ""}`}
                    onClick={clickable(a) ? () => open(a) : undefined}
                  >
                    <span className={`act-ico t-${a.type}`}>
                      <Ico size={16} />
                    </span>
                    <span className="act-text">
                      <span>
                        <Text a={a} />
                      </span>
                      <small>{hhmm(a.createdAt)}</small>
                    </span>
                    {a.photo?.thumbUrl && (
                      <img
                        className="notif-thumb"
                        src={a.photo.thumbUrl}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </Tag>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
  );
}
