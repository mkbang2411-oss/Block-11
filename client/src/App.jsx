import { AnimatePresence, motion } from "framer-motion";
import { useRoute } from "./lib/router.js";
import { useViewport } from "./lib/hooks.js";
import { useApp } from "./store.jsx";
import Background from "./components/Background.jsx";
import { Nav, UserChip } from "./components/Nav.jsx";
import LoginModal from "./components/LoginModal.jsx";
import Toasts from "./components/Toasts.jsx";
import Home from "./pages/Home.jsx";
import Feed from "./pages/Feed.jsx";
import Album from "./pages/Album.jsx";
import Profile from "./pages/Profile.jsx";
import Notifications from "./pages/Notifications.jsx";

const TITLES = { home: "khoanh_khac.exe", profile: "ca_nhan.exe" };

// Chỉ trang chủ (chụp ảnh) và trang cá nhân mới có khung cửa sổ. Các trang còn lại trải thẳng trên nền.
const FRAMED = new Set(["home", "profile"]);

// Kích thước khung. Khung là MỘT phần tử duy nhất, đổi kích thước bằng spring -> "morph" giữa 2 trang.
function frameSize(page, vw, vh) {
  const aw = vw - 16,
    ah = vh - 84;
  if (page === "profile") return { w: Math.min(aw, 640), h: Math.min(ah, 780) };
  return { w: Math.min(aw, 800), h: Math.min(ah, 660) };
}

export default function App() {
  const route = useRoute();
  const { loginOpen } = useApp();
  const { w, h } = useViewport();
  const { page } = route;
  const framed = FRAMED.has(page);
  const size = frameSize(framed ? page : "home", w, h);
  const isOwnAlbum = page === "album" && !route.userId;
  const freeKey = page === "album" ? `album:${route.userId || "me"}` : page;

  return (
    <>
      <Background />
      <Nav page={page} isOwnAlbum={isOwnAlbum} />
      <UserChip />

      <AnimatePresence mode="wait" initial={false}>
        {framed ? (
          <motion.div
            key="stage"
            className="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.main
              className={`win win-${page}`}
              initial={false}
              animate={{ width: size.w, height: size.h }}
              transition={{
                type: "spring",
                stiffness: 115,
                damping: 17,
                mass: 0.9,
              }}
            >
              <div className="win-bar">
                <span className="win-title">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={page}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.14 }}
                    >
                      {TITLES[page]}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="win-btns" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="win-body">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={page}
                    className="page"
                    initial={{ opacity: 0, scale: 0.97, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    {page === "home" && <Home />}
                    {page === "profile" && <Profile />}
                  </motion.div>
                </AnimatePresence>
              </div>
              <Stickers />
            </motion.main>
          </motion.div>
        ) : (
          <motion.div
            key={freeKey}
            className={`free-page free-${page}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {page === "feed" && <Feed />}
            {page === "album" && (
              <Album userId={route.userId} search={route.search} />
            )}
            {page === "notifications" && <Notifications />}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {loginOpen && <LoginModal key="login" />}
      </AnimatePresence>
      <Toasts />
    </>
  );
}

// Sticker pixel ở góc khung (gợi cảm hứng khung Paint pastel)
function Stickers() {
  return (
    <>
      <svg
        className="sticker s1"
        viewBox="0 0 16 16"
        width="34"
        height="34"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path
          fill="#ff6fae"
          d="M2 4h4v1h1v1h2V5h1V4h4v5h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2z"
        />
        <path fill="#fff" d="M3 5h2v1H3z" />
      </svg>
      <svg
        className="sticker s2"
        viewBox="0 0 16 16"
        width="30"
        height="30"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path
          fill="#ffd36e"
          d="M7 1h2v4h4v2h-4v2l3 6h-2l-2-3-2 3H4l3-6V7H3V5h4z"
        />
      </svg>
      <svg
        className="sticker s3"
        viewBox="0 0 16 16"
        width="36"
        height="36"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path fill="#8ff0ff" d="M5 5h6v1h2v1h1v4h-1v1H3v-1H2V8h1V6h2z" />
        <path fill="#fff" d="M4 8h2v1H4z" />
      </svg>
      <svg
        className="sticker s4"
        viewBox="0 0 16 16"
        width="30"
        height="30"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        <path
          fill="#7be0a8"
          d="M4 3h8v1h1v5h-1v1h-1v2H9v-2H7v2H5v-2H4V9H3V4h1z"
        />
        <path fill="#12154a" d="M5 6h2v2H5zm4 0h2v2H9z" />
      </svg>
    </>
  );
}
