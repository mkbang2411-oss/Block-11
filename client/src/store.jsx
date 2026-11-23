import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./lib/api.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [user, setUser] = useState(undefined); // undefined = đang tải
  const [friends, setFriends] = useState({
    friends: [],
    incoming: [],
    outgoing: [],
  });
  const [loginOpen, setLoginOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const pending = useRef(null);

  const toast = useCallback((text, kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const refreshFriends = useCallback(async () => {
    try {
      setFriends(await api.friends());
    } catch {
      /* chưa đăng nhập */
    }
  }, []);

  useEffect(() => {
    api
      .config()
      .then(setConfig)
      .catch(() =>
        setConfig({
          googleClientId: null,
          devLogin: false,
          emojis: ["❤️", "😆", "😮", "🥹", "🔥", "✨"],
          limits: {
            maxFiles: 5,
            maxFileBytes: 10485760,
            maxRequestBytes: 57671680,
            slotsPerPage: 6,
          },
        }),
      );
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (user) refreshFriends();
    else setFriends({ friends: [], incoming: [], outgoing: [] });
  }, [user, refreshFriends]);

  const refreshUnread = useCallback(async () => {
    try {
      setUnread((await api.unreadCount()).unread);
    } catch {
      /* im lặng, lần sau thử lại */
    }
  }, []);
  // Số thông báo chưa đọc: hỏi lại mỗi 30 giây và mỗi khi quay lại tab
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return undefined;
    }
    refreshUnread();
    const t = setInterval(refreshUnread, 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, refreshUnread]);

  const requireLogin = useCallback(
    (cb) => {
      if (user) {
        cb?.();
        return;
      }
      pending.current = cb || null;
      setLoginOpen(true);
    },
    [user],
  );

  const onLoggedIn = useCallback((u) => {
    setUser(u);
    setLoginOpen(false);
    const cb = pending.current;
    pending.current = null;
    if (cb) setTimeout(cb, 120);
  }, []);
  const closeLogin = useCallback(() => {
    pending.current = null;
    setLoginOpen(false);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      unread,
      setUnread,
      refreshUnread,
      config,
      user,
      setUser,
      friends,
      refreshFriends,
      loginOpen,
      requireLogin,
      onLoggedIn,
      closeLogin,
      logout,
      toasts,
      toast,
    }),
    [
      unread,
      refreshUnread,
      config,
      user,
      friends,
      loginOpen,
      requireLogin,
      onLoggedIn,
      closeLogin,
      logout,
      toasts,
      toast,
      refreshFriends,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
