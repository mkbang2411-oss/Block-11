import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useApp } from "../store.jsx";
import Modal from "./Modal.jsx";

let gsiPromise;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => {
      gsiPromise = null;
      reject(new Error("Không tải được Google Sign-In."));
    };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

export default function LoginModal() {
  const { config, onLoggedIn, closeLogin } = useApp();
  const btn = useRef(null);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!config?.googleClientId) return undefined;
    let dead = false;
    loadGsi()
      .then(() => {
        if (dead || !btn.current) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (resp) => {
            setBusy(true);
            setErr("");
            try {
              onLoggedIn((await api.loginGoogle(resp.credential)).user);
            } catch (e) {
              setErr(e.message);
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(btn.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: 300,
          logo_alignment: "left",
          locale: "vi",
        });
      })
      .catch(() =>
        setErr(
          "Không mở được cửa sổ đăng nhập Google, bạn kiểm tra mạng rồi thử lại nhé.",
        ),
      );
    return () => {
      dead = true;
    };
  }, [config, onLoggedIn]);

  const devLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      onLoggedIn((await api.loginDev(email)).user);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={closeLogin} title="welcome.exe">
      <div className="login">
        <div className="login-art" aria-hidden="true">
          <span>✦</span>
          <span>♡</span>
          <span>✧</span>
        </div>
        <h2 className="display">Vào album của bạn</h2>
        <p className="muted">
          Đăng nhập bằng tài khoản Google để đăng ảnh, chụp ảnh và xem ảnh của
          bạn bè. Tài khoản mới sẽ được tạo tự động.
        </p>
        <div className="gsi-wrap" aria-busy={busy}>
          {config?.googleClientId ? (
            <div ref={btn} />
          ) : (
            <p className="note warn">
              Đăng nhập bằng Google đang tạm thời chưa dùng được. Bạn quay lại
              sau ít phút nhé.
            </p>
          )}
        </div>
        {config?.devLogin && (
          <form className="dev-login" onSubmit={devLogin}>
            <span className="pixel">dev mode</span>
            <input
              type="email"
              required
              placeholder="email thử nghiệm, vd: an@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn ghost" disabled={busy}>
              Vào thử
            </button>
          </form>
        )}
        {err && (
          <p className="note err" role="alert">
            {err}
          </p>
        )}
      </div>
    </Modal>
  );
}
