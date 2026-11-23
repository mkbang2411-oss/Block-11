import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { animate, motion } from "framer-motion";
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api } from "../lib/api.js";
import { prefersReducedMotion, useElementSize } from "../lib/hooks.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";
import { Avatar } from "../components/Nav.jsx";
import PhotoImg from "../components/PhotoImg.jsx";
import PhotoViewer from "../components/PhotoViewer.jsx";

const COLS = 2,
  ROWS = 3,
  PER = COLS * ROWS,
  GAP = 12,
  PAD = 18,
  COVER = 14,
  THICK = 10;
const tilt = (slot) => (((slot * 37) % 7) - 3) * 0.25; // nghiêng cực nhẹ từng tấm, ổn định theo vị trí
const FLIP_MS = 0.75;

/* Nội dung một ô (luôn khung 3:4):
   3:4 -> phủ kín · 1:1 -> giữ nguyên, nằm giữa ô · 4:3 -> xoay 90° để phủ kín (mở ra sẽ xoay về 4:3 như gốc). */
function CardBody({ p, cell }) {
  const sizes = `${Math.round(cell.h)}px`;
  if (p.aspect === "4:3") {
    return (
      <span className="rot" style={{ width: cell.h - 12, height: cell.w - 12 }}>
        <PhotoImg photo={p} sizes={sizes} className="ph fill" />
      </span>
    );
  }
  return (
    <PhotoImg
      photo={p}
      sizes={`${Math.round(cell.w)}px`}
      className={`ph ${p.aspect === "1:1" ? "sq" : "fill"}`}
    />
  );
}

/* ---- Tờ giấy lật CONG THẬT ----
   Tờ giấy được cắt thành N dải dọc lồng nhau (preserve-3d). Mỗi dải xoay thêm một góc nhỏ so với dải trước,
   nên mép tờ giấy bị uốn lại phía sau khi lật (như giấy thật) rồi duỗi ra khi đáp xuống.
   Góc quay cập nhật trực tiếp vào DOM mỗi khung hình (không re-render React). */
const N = 12,
  TILT = 4,
  BEND = 52;
function Leaf({ pageW, pageH, dir, front, back, render, onDone }) {
  const root = useRef(null);
  const cast = useRef(null);
  const sw = pageW / N;
  useLayoutEffect(() => {
    const strips = [...root.current.querySelectorAll(".strip")];
    const shades = strips.map((s) => [
      ...s.querySelectorAll(":scope > .face > .sh"),
    ]);
    const apply = (t) => {
      const th = -dir * (TILT + (180 - 2 * TILT) * t);
      const d = (dir * BEND * Math.sin(2 * Math.PI * t)) / N;
      root.current.style.transform = `rotateY(${th}deg)`;
      strips.forEach((el, i) => {
        if (i) el.style.transform = `rotateY(${d}deg)`;
        const a = ((th + i * d) * Math.PI) / 180;
        const o = 0.05 + 0.38 * Math.abs(Math.sin(a));
        shades[i].forEach((sh) => (sh.style.opacity = o));
      });
      // bóng tờ giấy đổ xuống trang bên dưới
      const c = cast.current;
      if (c) {
        const side = t < 0.5 ? dir : -dir;
        const w = pageW * Math.abs(Math.cos((th * Math.PI) / 180));
        c.style.width = `${w}px`;
        c.style.left = `${side === 1 ? pageW : pageW - w}px`;
        c.style.opacity = Math.sin(Math.PI * t) * 0.9;
        c.style.background = `linear-gradient(${side === 1 ? 90 : 270}deg, rgba(40,25,5,.38), transparent)`;
      }
    };
    apply(0);
    const ctl = animate(0, 1, {
      duration: FLIP_MS,
      ease: [0.45, 0.05, 0.25, 1],
      onUpdate: apply,
      onComplete: onDone,
    });
    return () => ctl.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fo = (i) => (dir === 1 ? i * sw : (N - 1 - i) * sw);
  const bo = (i) => (dir === 1 ? (N - 1 - i) * sw : i * sw);
  const Strip = (i) => (
    <div
      key={i}
      className="strip"
      style={{
        width: sw + 1,
        height: pageH,
        left: i === 0 ? (dir === 1 ? 0 : pageW - sw - 1) : dir === 1 ? sw : -sw,
        transformOrigin: dir === 1 ? "0 50%" : "100% 50%",
      }}
    >
      <div className="face front">
        <div
          className="inner"
          style={{ left: -fo(i), width: pageW, height: pageH }}
        >
          {render(front, dir === 1 ? "r" : "l")}
        </div>
        <i className="sh" />
      </div>
      <div className="face back">
        <div
          className="inner"
          style={{ left: -bo(i), width: pageW, height: pageH }}
        >
          {render(back, dir === 1 ? "l" : "r")}
        </div>
        <i className="sh" />
      </div>
      {i < N - 1 && Strip(i + 1)}
    </div>
  );
  return (
    <>
      <i
        ref={cast}
        className="cast"
        style={{ height: pageH }}
        aria-hidden="true"
      />
      <div
        ref={root}
        className="leaf"
        style={{
          width: pageW,
          height: pageH,
          left: dir === 1 ? pageW : 0,
          transformOrigin: dir === 1 ? "0 50%" : "100% 50%",
        }}
      >
        {Strip(0)}
      </div>
    </>
  );
}

export default function Album({ userId, search }) {
  const { user, requireLogin } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const [open, setOpen] = useState(null);
  const [drag, setDrag] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const [flip, setFlip] = useState(null); // đang lật trang: { from, to, dir }
  const [areaRef, size] = useElementSize();
  const { toast } = useApp();

  /* ---- Tải album (của mình hoặc của bạn) ---- */
  useEffect(() => {
    if (!user) return undefined;
    let dead = false;
    setData(null);
    setError("");
    api
      .album(userId)
      .then((r) => {
        if (dead) return;
        setData(r);
        const newIds = (search.get("new") || "").split(",").filter(Boolean);
        const focus = search.get("focus");
        const target = r.photos.find((p) => p.id === (newIds[0] || focus));
        setPage(target ? Math.floor(target.slot / PER) : r.startPage); // mặc định: trang chứa ảnh đăng gần nhất
        if (newIds.length) {
          setFresh(new Set(newIds));
          setTimeout(() => setFresh(new Set()), 3500);
        }
        if (focus && target) setTimeout(() => setOpen(target.id), 700);
      })
      .catch((e) => !dead && setError(e.message));
    return () => {
      dead = true;
    };
  }, [userId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const photos = data?.photos || [];
  const isMine = !!data?.isMine;
  const bySlot = useMemo(
    () => new Map(photos.map((p) => [p.slot, p])),
    [photos],
  );
  const ordered = useMemo(
    () => [...photos].sort((a, b) => a.slot - b.slot),
    [photos],
  );

  /* ---- Bố cục cuốn album ---- */
  const pps = size.w >= 760 ? 2 : 1; // số trang hiển thị cùng lúc
  const maxSlot = photos.reduce((m, p) => Math.max(m, p.slot), -1);
  let pageCount = Math.max(
    pps,
    Math.ceil((maxSlot + 1) / PER) + (isMine ? 1 : 0),
  );
  pageCount = Math.ceil(pageCount / pps) * pps;
  const first = page - (page % pps);
  const topPad = !isMine && data ? 40 : 0; // chừa chỗ cho chip "Album của ..."
  const areaH = size.h - 54 - topPad;
  const sideRoom = size.w >= 640 ? 112 : 84; // chừa chỗ cho 2 nút lật trang
  const padPage = 2 * PAD + (COLS - 1) * GAP;
  const cellH0 =
    (areaH - 2 * COVER - THICK - 2 * PAD - (ROWS - 1) * GAP - 16) / ROWS;
  const cellWmax =
    (size.w - sideRoom - 2 * COVER - 30 - pps * padPage) / (pps * COLS);
  const cw = Math.max(40, Math.floor(Math.min(cellH0 * 0.75, cellWmax)));
  const cell = { w: cw, h: Math.round((cw * 4) / 3) };
  const pageW = padPage + COLS * cell.w,
    pageH = 2 * PAD + (ROWS - 1) * GAP + ROWS * cell.h;
  const ready = size.w > 0 && size.h > 160;

  const live = useRef({});
  live.current = { photos, bySlot, first, pps, isMine, flipping: !!flip, flip };

  const go = useCallback(
    (to) => {
      const L = live.current;
      const t = Math.max(0, Math.min(pageCount - L.pps, to - (to % L.pps)));
      if (t === L.first || L.flipping) return;
      const dir = t > L.first ? 1 : -1;
      setDir(dir);
      if (L.pps === 2 && !prefersReducedMotion())
        setFlip({ from: L.first, to: t, dir }); // trang giấy lật thật
      else setPage(t);
    },
    [pageCount],
  );
  live.current.go = go;
  const endFlip = useCallback(() => {
    const f = live.current.flip;
    if (f) {
      setPage(f.to);
      setFlip(null);
    }
  }, []);

  useEffect(() => {
    const on = (e) => {
      if (open || drag || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") go(first - pps);
      if (e.key === "ArrowRight") go(first + pps);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, drag, first, pps, go]);

  /* ---- Kéo thả đổi ô (pointer events: chuột + cảm ứng) ---- */
  const st = useRef(null);
  const edge = useRef({ side: 0, t: null });
  const suppress = useRef(false);

  const reorder = useCallback(
    async (p, target) => {
      const { bySlot: m } = live.current;
      const occ = m.get(target);
      const moves = [
        { id: p.id, slot: target },
        ...(occ && occ.id !== p.id ? [{ id: occ.id, slot: p.slot }] : []),
      ];
      const prev = live.current.photos;
      setData((d) => ({
        ...d,
        photos: d.photos.map((x) => {
          const mv = moves.find((y) => y.id === x.id);
          return mv ? { ...x, slot: mv.slot } : x;
        }),
      }));
      try {
        await api.reorder(moves);
      } catch (e) {
        setData((d) => ({ ...d, photos: prev }));
        toast(e.message, "err");
      }
    },
    [toast],
  );

  const stopDrag = useCallback(() => {
    window.removeEventListener("pointermove", onMoveRef.current);
    window.removeEventListener("pointerup", onUpRef.current);
    window.removeEventListener("pointercancel", onUpRef.current);
    clearTimeout(edge.current.t);
    edge.current = { side: 0, t: null };
    if (st.current) clearTimeout(st.current.timer);
    st.current = null;
    setDrag(null);
  }, []);

  const onMoveRef = useRef();
  const onUpRef = useRef();
  onMoveRef.current = (e) => {
    const s = st.current;
    if (!s) return;
    const dist = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
    if (!s.active) {
      if (s.touch) {
        if (dist > 10) stopDrag();
        return;
      } // cảm ứng: chưa giữ đủ lâu mà đã di chuyển -> không phải kéo
      if (dist < 6) return;
      s.active = true;
    }
    const over = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-slot]");
    setDrag({
      id: s.p.id,
      x: e.clientX,
      y: e.clientY,
      ox: s.ox,
      oy: s.oy,
      w: s.w,
      h: s.h,
      over: over ? Number(over.dataset.slot) : null,
    });
    // Kéo sát mép -> lật trang sau một nhịp
    const r = areaRef.current?.getBoundingClientRect();
    const side = r
      ? e.clientX < r.left + 56
        ? -1
        : e.clientX > r.right - 56
          ? 1
          : 0
      : 0;
    if (side !== edge.current.side) {
      clearTimeout(edge.current.t);
      edge.current = {
        side,
        t: side
          ? setTimeout(function flip() {
              const L = live.current;
              L.go(L.first + side * L.pps);
              edge.current.t = setTimeout(flip, 900);
            }, 650)
          : null,
      };
    }
  };
  onUpRef.current = (e) => {
    const s = st.current;
    if (s?.active) {
      suppress.current = true;
      setTimeout(() => {
        suppress.current = false;
      }, 60);
      const over = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-slot]");
      const target = over ? Number(over.dataset.slot) : null;
      if (target !== null && target !== s.p.slot) reorder(s.p, target);
    }
    stopDrag();
  };

  const onDown = (p) => (e) => {
    if (
      !live.current.isMine ||
      (e.pointerType === "mouse" && e.button !== 0) ||
      st.current
    )
      return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = {
      p,
      sx: e.clientX,
      sy: e.clientY,
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
      w: r.width,
      h: r.height,
      active: false,
      touch: e.pointerType !== "mouse",
      timer: null,
    };
    if (s.touch)
      s.timer = setTimeout(() => {
        s.active = true;
        setDrag({
          id: p.id,
          x: s.sx,
          y: s.sy,
          ox: s.ox,
          oy: s.oy,
          w: s.w,
          h: s.h,
          over: p.slot,
        });
        navigator.vibrate?.(12);
      }, 260);
    st.current = s;
    window.addEventListener("pointermove", onMoveRef.current);
    window.addEventListener("pointerup", onUpRef.current);
    window.addEventListener("pointercancel", onUpRef.current);
  };
  useEffect(() => stopDrag, [stopDrag]);

  const update = useCallback(
    (np) =>
      setData((d) => ({
        ...d,
        photos: d.photos.map((x) => (x.id === np.id ? { ...x, ...np } : x)),
      })),
    [],
  );
  const removed = useCallback(
    (id) =>
      setData((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== id) })),
    [],
  );

  /* ---- Trạng thái đặc biệt ---- */
  if (user === null)
    return (
      <div className="empty">
        <p className="display big">Cuốn album của bạn</p>
        <p className="muted">Đăng nhập để xem và sắp xếp ảnh của bạn.</p>
        <button className="btn primary" onClick={() => requireLogin()}>
          Đăng nhập với Google
        </button>
      </div>
    );
  if (error)
    return (
      <div className="empty">
        <p className="display big">Chưa mở được album này</p>
        <p className="muted">{error}</p>
        <button className="btn ghost" onClick={() => navigate("/feed")}>
          Về trang bạn bè
        </button>
      </div>
    );

  const firstEmpty = isMine
    ? (() => {
        let s = 0;
        while (bySlot.has(s)) s++;
        return s;
      })()
    : -1;
  const draggingPhoto = drag && photos.find((p) => p.id === drag.id);

  // Một trang giấy với các ngăn nhựa trong. interactive=false dùng cho mặt giấy đang lật (chỉ để nhìn).
  const Sheet = (pi, side, interactive) => (
    <div
      key={pi}
      className={`sheet ${side}`}
      style={{
        width: pageW,
        height: pageH,
        padding: PAD,
        gap: GAP,
        gridTemplateColumns: `repeat(${COLS}, ${cell.w}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${cell.h}px)`,
      }}
    >
      {Array.from({ length: PER }, (_, k) => {
        const slot = pi * PER + k;
        const p = bySlot.get(slot);
        const over = interactive && drag?.over === slot;
        return (
          <div
            key={slot}
            className={`slot ${over ? "hover" : ""} ${interactive && drag ? "dropping" : ""}`}
            {...(interactive ? { "data-slot": slot } : {})}
          >
            {p ? (
              interactive ? (
                <motion.button
                  className={`card ${drag?.id === p.id ? "lifted" : ""} ${fresh.has(p.id) ? "fresh" : ""} ${isMine ? "can-drag" : ""}`}
                  data-photo-id={p.id}
                  data-rotated={p.aspect === "4:3" ? "1" : "0"}
                  style={{ rotate: tilt(slot) }}
                  initial={
                    fresh.has(p.id)
                      ? { scale: 0.2, opacity: 0, rotate: -18 }
                      : false
                  }
                  animate={{ scale: 1, opacity: 1, rotate: tilt(slot) }}
                  transition={{
                    type: "spring",
                    stiffness: 240,
                    damping: 15,
                    delay: fresh.has(p.id) ? 0.4 : 0,
                  }}
                  onPointerDown={onDown(p)}
                  onClick={() => {
                    if (!suppress.current) setOpen(p.id);
                  }}
                  aria-label={`Ảnh ${p.title || "chưa có tiêu đề"}${isMine ? ". Giữ và kéo để đổi chỗ" : ""}`}
                >
                  <CardBody p={p} cell={cell} />
                  {p.commentCount > 0 && (
                    <span className="cmt-dot" aria-hidden="true">
                      {p.commentCount}
                    </span>
                  )}
                </motion.button>
              ) : (
                <div className="card" style={{ rotate: `${tilt(slot)}deg` }}>
                  <CardBody p={p} cell={cell} />
                </div>
              )
            ) : interactive && slot === firstEmpty ? (
              <button
                className="add-slot"
                onClick={() => navigate("/")}
                aria-label="Thêm ảnh mới"
              >
                <Plus size={22} />
              </button>
            ) : null}
            <i className="gloss" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );

  // Hai trang đang nằm yên (hoặc nửa còn lại khi một tờ đang lật)
  let leftPage = first,
    rightPage = first + 1,
    leaf = null;
  if (flip && pps === 2) {
    if (flip.dir === 1) {
      rightPage = flip.to + 1;
      leaf = { front: flip.from + 1, back: flip.to };
    } else {
      leftPage = flip.to;
      leaf = { front: flip.from, back: flip.to + 1 };
    }
  }
  const spreadW = pageW * pps;
  const frac = pageCount > pps ? first / (pageCount - pps) : 0; // đã lật bao nhiêu -> chồng giấy trái/phải dày mỏng
  const tl = 3 + frac * 12,
    tr = 3 + (1 - frac) * 12;

  return (
    <div className="album" ref={areaRef}>
      {!isMine && data && (
        <div className="album-owner">
          <button
            className="icon-btn sm"
            onClick={() => navigate("/feed")}
            aria-label="Về trang bạn bè"
          >
            <ArrowLeft size={16} />
          </button>
          <Avatar user={data.owner} size={26} />{" "}
          <span>
            Album của <b>{data.owner.name}</b>
          </span>
        </div>
      )}
      {!data && (
        <div className="loading-dots center-abs">
          <i />
          <i />
          <i />
        </div>
      )}

      {data && ready && (
        <>
          <div
            className="book-wrap"
            style={{
              marginTop: topPad,
              height: `calc(100% - 54px - ${topPad}px)`,
            }}
          >
            <button
              className="page-btn left"
              onClick={() => go(first - pps)}
              disabled={first === 0 || !!flip}
              aria-label="Trang trước"
            >
              <ChevronLeft size={22} />
            </button>

            <div className="book-tilt">
              <div
                className="cover"
                style={{ padding: COVER, paddingBottom: COVER + THICK }}
              >
                <motion.div
                  key={pps === 1 ? first : "spread"}
                  className="spread"
                  style={{
                    width: spreadW,
                    height: pageH,
                    "--tl": `${tl}px`,
                    "--tr": `${tr}px`,
                  }}
                  initial={pps === 1 ? { opacity: 0, x: dir * 36 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <i className="stack l" aria-hidden="true" />
                  <i className="stack r" aria-hidden="true" />
                  <i className="stack b" aria-hidden="true" />
                  {Sheet(leftPage, "l", !flip)}
                  {pps === 2 && Sheet(rightPage, "r", !flip)}
                  {pps === 2 && <div className="gutter" aria-hidden="true" />}

                  {leaf && (
                    <Leaf
                      key={`${flip.from}-${flip.to}`}
                      pageW={pageW}
                      pageH={pageH}
                      dir={flip.dir}
                      front={leaf.front}
                      back={leaf.back}
                      render={(pi, side) => Sheet(pi, side, false)}
                      onDone={endFlip}
                    />
                  )}
                </motion.div>
              </div>
            </div>

            <button
              className="page-btn right"
              onClick={() => go(first + pps)}
              disabled={first + pps >= pageCount || !!flip}
              aria-label="Trang sau"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="album-foot">
            <span className="pixel">
              trang {first + 1}
              {pps === 2 ? `–${first + 2}` : ""} / {pageCount}
            </span>
            <div className="dots">
              {Array.from({ length: pageCount / pps }, (_, i) => (
                <button
                  key={i}
                  className={i * pps === first ? "on" : ""}
                  onClick={() => go(i * pps)}
                  aria-label={`Tới trang ${i * pps + 1}`}
                />
              ))}
            </div>
            {isMine && (
              <span className="muted hint">Giữ và kéo ảnh để đổi chỗ</span>
            )}
          </div>

          {!photos.length && isMine && (
            <div className="album-empty">
              <p className="display">Album còn trống ✦</p>
              <p className="muted">
                Mỗi ảnh bạn đăng sẽ nằm vào một ngăn ở đây.
              </p>
            </div>
          )}
        </>
      )}

      {drag &&
        draggingPhoto &&
        createPortal(
          <div
            className="drag-ghost"
            style={{
              left: drag.x - drag.ox,
              top: drag.y - drag.oy,
              width: drag.w,
              height: drag.h,
            }}
          >
            <div className="card">
              <CardBody p={draggingPhoto} cell={cell} />
            </div>
          </div>,
          document.body,
        )}

      {open && (
        <PhotoViewer
          photos={ordered}
          startId={open}
          isMine={isMine}
          onClose={() => setOpen(null)}
          onUpdate={update}
          onDeleted={removed}
        />
      )}
    </div>
  );
}
