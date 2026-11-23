import { motion } from "framer-motion";
import { Bell, BookOpen, LogIn, Sparkles, UserRound } from "lucide-react";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";

const ITEMS = [
  { id: "feed", label: "Bạn bè", path: "/feed", Icon: Sparkles },
  { id: "album", label: "Album", path: "/album", Icon: BookOpen },
  {
    id: "notifications",
    label: "Thông báo",
    path: "/notifications",
    Icon: Bell,
  },
  { id: "profile", label: "Cá nhân", path: "/me", Icon: UserRound },
];

export function Nav({ page, isOwnAlbum }) {
  const { unread, user } = useApp();
  const active = page === "album" ? (isOwnAlbum ? "album" : "feed") : page;
  return (
    <nav className="nav" aria-label="Điều hướng chính">
      <button
        className="brand"
        onClick={() => navigate("/")}
        aria-label="Về trang chủ"
        title="Trang chủ"
      >
        <span>✦</span>
      </button>
      <div className="pill">
        {ITEMS.map(({ id, label, path, Icon }) => (
          <button
            key={id}
            className={active === id ? "on" : ""}
            onClick={() => navigate(path)}
            aria-current={active === id ? "page" : undefined}
          >
            {active === id && (
              <motion.span
                layoutId="nav-on"
                className="nav-on"
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
              />
            )}
            <span className="ico">
              <Icon size={18} strokeWidth={2.2} />
              {id === "notifications" && user && unread > 0 && (
                <i className="notif-badge">{unread > 9 ? "9+" : unread}</i>
              )}
            </span>
            <span className="lbl">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function UserChip() {
  const { user, requireLogin } = useApp();
  if (user === undefined) return null;
  if (!user)
    return (
      <button className="chip login-chip" onClick={() => requireLogin()}>
        <LogIn size={16} /> <span>Đăng nhập</span>
      </button>
    );
  return (
    <button
      className="chip user-chip"
      onClick={() => navigate("/me")}
      title="Trang cá nhân"
    >
      <Avatar user={user} size={26} /> <span>{user.name}</span>
    </button>
  );
}

export function Avatar({ user, size = 36, ring }) {
  const initial = (user?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className={`avatar ${ring ? "ring" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : (
        initial
      )}
    </span>
  );
}
