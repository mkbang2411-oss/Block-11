import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  History,
  LogOut,
  Mail,
  Pencil,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api.js";
import { centerCrop, cropToBlob, loadImage } from "../lib/img.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";
import { Avatar } from "../components/Nav.jsx";
import Modal from "../components/Modal.jsx";
import Cropper from "../components/Cropper.jsx";
import ActivityLog from "../components/ActivityLog.jsx";

const PAGE = 20; // mỗi lần hiện thêm 20 dòng, tránh danh sách dài vô tận

function AvatarCrop({ src, img, onClose, onDone }) {
  const nat = { w: img.naturalWidth, h: img.naturalHeight };
  const [crop, setCrop] = useState(centerCrop(nat.w, nat.h, "1:1"));
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    setBusy(true);
    await onDone(await cropToBlob(img, crop, 512));
  };
  return (
    <Modal onClose={onClose} title="avatar.exe" wide className="editor">
      <div className="editor-body">
        <div className="editor-canvas">
          <Cropper
            src={src}
            nat={nat}
            ratio="1:1"
            crop={crop}
            onCrop={setCrop}
          />
        </div>
        <div className="editor-tools">
          <div className="editor-actions">
            <span className="grow" />
            <button className="btn ghost" onClick={onClose}>
              Hủy
            </button>
            <button className="btn primary" onClick={apply} disabled={busy}>
              <Check size={16} /> {busy ? "Đang lưu…" : "Dùng ảnh này"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function Profile({ search }) {
  const {
    user,
    setUser,
    friends,
    refreshFriends,
    requireLogin,
    logout,
    toast,
  } = useApp();
  const [editName, setEditName] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState(null);
  const file = useRef(null);
  const [tab, setTab] = useState(search?.get("tab") || "friends");
  const [query, setQuery] = useState("");
  const [shownN, setShownN] = useState(PAGE);
  const [outN, setOutN] = useState(PAGE);
  useEffect(() => {
    const t = search?.get("tab");
    if (["friends", "requests", "activity"].includes(t)) setTab(t);
  }, [search]);

  if (user === null)
    return (
      <div className="empty">
        <p className="display big">Trang cá nhân</p>
        <p className="muted">Đăng nhập để chỉnh avatar và kết bạn.</p>
        <button className="btn primary" onClick={() => requireLogin()}>
          Đăng nhập với Google
        </button>
      </div>
    );
  if (!user) return null;

  const pickAvatar = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type))
      return toast("Ảnh đại diện cần là ảnh dạng JPG hoặc PNG nhé.", "err");
    const url = URL.createObjectURL(f);
    try {
      setCrop({ url, img: await loadImage(url) });
    } catch (x) {
      toast(x.message, "err");
    }
  };
  const saveAvatar = async (blob) => {
    try {
      setUser((await api.setAvatar(blob)).user);
      toast("Đã đổi avatar ✦");
      setCrop(null);
    } catch (e) {
      toast(e.message, "err");
      setCrop(null);
    }
  };
  const saveName = async () => {
    const n = editName.trim();
    setEditName(null);
    if (!n || n === user.name) return;
    try {
      setUser((await api.rename(n)).user);
    } catch (e) {
      toast(e.message, "err");
    }
  };
  const addFriend = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.addFriend(email);
      toast(
        r.status === "accepted"
          ? "Hai bạn đã là bạn bè ✦"
          : r.registered
            ? "Đã gửi lời mời kết bạn"
            : "Đã gửi lời mời. Họ sẽ thấy khi đăng nhập bằng email này.",
      );
      setEmail("");
      refreshFriends();
    } catch (x) {
      toast(x.message, "err");
    }
    setBusy(false);
  };
  const act = (fn, msg) => async () => {
    try {
      await fn();
      if (msg) toast(msg);
      refreshFriends();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const q = query.trim().toLowerCase();
  const matched = q
    ? friends.friends.filter(
        (f) =>
          f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
      )
    : friends.friends;
  const shown = matched.slice(0, shownN);
  const TABS = [
    {
      id: "friends",
      label: "Bạn bè",
      Icon: Users,
      count: friends.friends.length,
    },
    { id: "requests", label: "Kết bạn", Icon: UserPlus },
    { id: "activity", label: "Nhật ký", Icon: History },
  ];

  return (
    <div className="profile scroll">
      <section className="me-card">
        <div className="me-avatar">
          <Avatar user={user} size={84} ring />
          <button
            className="icon-btn on edit-av"
            onClick={() => file.current?.click()}
            aria-label="Đổi avatar"
          >
            <Camera size={15} />
          </button>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={pickAvatar}
          />
        </div>
        <div className="me-info">
          {editName === null ? (
            <h2 className="display">
              <span className="me-name">{user.name}</span>
              <button
                className="icon-btn sm"
                onClick={() => setEditName(user.name)}
                aria-label="Đổi tên"
              >
                <Pencil size={13} />
              </button>
            </h2>
          ) : (
            <input
              className="title-input"
              autoFocus
              value={editName}
              maxLength={60}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label="Tên hiển thị"
            />
          )}
          <p className="muted">
            <Mail size={13} /> {user.email}
          </p>
          {user.hasCustomAvatar && (
            <button
              className="link"
              onClick={act(
                async () => setUser((await api.resetAvatar()).user),
                "Đã dùng lại ảnh Google",
              )}
            >
              Dùng lại ảnh Google
            </button>
          )}
        </div>
        <button
          className="btn ghost sm me-logout"
          onClick={async () => {
            await logout();
            navigate("/");
          }}
        >
          <LogOut size={15} /> Đăng xuất
        </button>
      </section>

      <div
        className="seg sticky"
        role="tablist"
        aria-label="Các khu trang cá nhân"
      >
        {TABS.map(({ id, label, Icon, count, badge }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`seg-btn ${tab === id ? "on" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} /> <span>{label}</span>
            {count != null && <small className="seg-count">{count}</small>}
            {badge > 0 && <i className="seg-badge">{badge}</i>}
          </button>
        ))}
      </div>

      {tab === "friends" && (
        <section className="block">
          {friends.friends.length > 0 && (
            <label className="search">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShownN(PAGE);
                }}
                placeholder={`Tìm trong ${friends.friends.length} người bạn…`}
                aria-label="Tìm bạn bè"
              />
              {query && (
                <button
                  type="button"
                  className="icon-btn sm"
                  onClick={() => {
                    setQuery("");
                    setShownN(PAGE);
                  }}
                  aria-label="Xóa tìm kiếm"
                >
                  <X size={13} />
                </button>
              )}
            </label>
          )}
          {!friends.friends.length && (
            <div className="empty inline">
              <Users size={32} className="muted" />
              <p className="display big">Chưa có bạn bè</p>
              <p className="muted">
                Mời bạn bằng Gmail để cùng xem album của nhau.
              </p>
              <button
                className="btn primary"
                onClick={() => setTab("requests")}
              >
                <UserPlus size={16} /> Kết bạn ngay
              </button>
            </div>
          )}
          {friends.friends.length > 0 && !matched.length && (
            <p className="muted pad">Không thấy ai tên “{query}”.</p>
          )}
          <ul className="people">
            <AnimatePresence initial={false}>
              {shown.map((f) => (
                <motion.li
                  key={f.id}
                  layout="position"
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <Avatar user={f} size={40} ring={!!f.latestPhotoAt} />
                  <span>
                    <b>{f.name}</b>
                    <small>{f.email}</small>
                  </span>
                  <button
                    className="btn ghost sm"
                    onClick={() => navigate(`/album/${f.id}`)}
                  >
                    Xem album
                  </button>
                  <button
                    className="icon-btn sm"
                    onClick={() =>
                      confirm(`Hủy kết bạn với ${f.name}?`) &&
                      act(() => api.unfriend(f.id))()
                    }
                    aria-label="Hủy kết bạn"
                  >
                    <X size={14} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {matched.length > shown.length && (
            <button
              className="btn ghost more"
              onClick={() => setShownN((n) => n + PAGE)}
            >
              Xem thêm {Math.min(PAGE, matched.length - shown.length)} người{" "}
              <small>(còn {matched.length - shown.length})</small>
            </button>
          )}
        </section>
      )}

      {tab === "requests" && (
        <div className="stack-blocks">
          <section className="block card-block">
            <h3 className="display">Kết bạn bằng Gmail</h3>
            <form className="add-friend" onSubmit={addFriend}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="gmail của bạn bè, vd: linh@gmail.com"
                aria-label="Địa chỉ Gmail của bạn bè"
              />
              <button className="btn primary" disabled={busy}>
                <UserPlus size={16} /> Gửi lời mời
              </button>
            </form>
          </section>

          <section className="block">
            <h3 className="display">
              Đang chờ họ chấp nhận <small>{friends.outgoing.length}</small>
            </h3>
            {!friends.outgoing.length && (
              <p className="muted pad">Bạn chưa có lời mời nào đang chờ.</p>
            )}
            <ul className="people mute">
              {friends.outgoing.slice(0, outN).map((r) => (
                <li key={r.requestId}>
                  <span className="avatar">
                    <Mail size={16} />
                  </span>
                  <span>
                    <b>{r.email}</b>
                  </span>
                  <button
                    className="icon-btn sm"
                    onClick={act(() => api.dropRequest(r.requestId))}
                    aria-label="Hủy lời mời"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {friends.outgoing.length > outN && (
              <button
                className="btn ghost more"
                onClick={() => setOutN((n) => n + PAGE)}
              >
                Xem thêm <small>(còn {friends.outgoing.length - outN})</small>
              </button>
            )}
          </section>
        </div>
      )}

      {tab === "activity" && <ActivityLog />}

      <AnimatePresence>
        {crop && (
          <AvatarCrop
            key="c"
            src={crop.url}
            img={crop.img}
            onClose={() => setCrop(null)}
            onDone={saveAvatar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
