import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera as CamIcon, ImagePlus } from "lucide-react";
import { api } from "../lib/api.js";
import {
  ACCEPT,
  centerCrop,
  isAllowedRatio,
  loadImage,
  nearestRatio,
} from "../lib/img.js";
import { navigate } from "../lib/router.js";
import { useApp } from "../store.jsx";
import Camera from "../components/Camera.jsx";
import UploadStage from "../components/UploadStage.jsx";

const uid = () => Math.random().toString(36).slice(2);

export default function Home() {
  const { user, config, requireLogin, toast } = useApp();
  const [mode, setMode] = useState("idle"); // idle | camera | stage
  const [items, setItems] = useState([]);
  const [over, setOver] = useState(false);
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState(0);
  const input = useRef(null);
  const L = config?.limits || {
    maxFiles: 5,
    maxFileBytes: 10485760,
    maxRequestBytes: 57671680,
  };

  const addFiles = useCallback(
    async (files) => {
      const room = L.maxFiles - items.length;
      if (files.length > room)
        toast(`Chỉ đăng được tối đa ${L.maxFiles} ảnh mỗi lần.`, "err");
      const added = [];
      for (const f of files.slice(0, Math.max(0, room))) {
        if (!["image/jpeg", "image/png"].includes(f.type)) {
          toast(
            `“${f.name}” không phải ảnh JPG hoặc PNG nên mình chưa dùng được.`,
            "err",
          );
          continue;
        }
        if (f.size > L.maxFileBytes) {
          toast(
            `“${f.name}” nặng quá (tối đa ${L.maxFileBytes / 1048576} MB một ảnh), bạn chọn ảnh nhẹ hơn nhé.`,
            "err",
          );
          continue;
        }
        const url = URL.createObjectURL(f);
        try {
          const img = await loadImage(url); // trình duyệt đã xoay theo EXIF khi báo kích thước
          const nat = { w: img.naturalWidth, h: img.naturalHeight };
          const ratio = nearestRatio(nat.w, nat.h);
          // Ảnh sai tỉ lệ: tự cắt giữa về tỉ lệ gần nhất (người dùng chỉnh lại được)
          added.push({
            id: uid(),
            file: f,
            url,
            nat,
            ratio,
            crop: isAllowedRatio(nat.w, nat.h)
              ? null
              : centerCrop(nat.w, nat.h, ratio),
            title: "",
            alt: "",
            error: "",
          });
        } catch {
          URL.revokeObjectURL(url);
          toast(`Mình không mở được “${f.name}”, bạn thử ảnh khác nhé.`, "err");
        }
      }
      if (added.length) setItems((l) => [...l, ...added]);
      return added.length;
    },
    [items.length, L, toast],
  );

  const onPick = (e) => {
    const f = [...e.target.files];
    e.target.value = "";
    if (f.length) {
      addFiles(f);
      setMode("stage");
    }
  };
  const chooseUpload = () =>
    requireLogin(() => {
      setMode("stage");
      if (user) input.current?.click();
    });
  const chooseCamera = () => requireLogin(() => setMode("camera"));

  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || posting) return;
    await addFiles(files);
    requireLogin(() => setMode("stage"));
  };

  const finish = (ids) => {
    setItems([]);
    toast(ids.length > 1 ? `Đã đăng ${ids.length} ảnh ✦` : "Đã đăng ảnh ✦");
    navigate(`/album?new=${ids.join(",")}`);
  };

  const post = async () => {
    if (!items.length) return;
    const total = items.reduce((s, i) => s + i.file.size, 0);
    if (total > L.maxRequestBytes) {
      toast(
        "Các ảnh này hơi nặng khi đăng cùng lúc, bạn bớt vài ảnh nhé.",
        "err",
      );
      return;
    }
    const fd = new FormData();
    items.forEach((i) => fd.append("photos", i.file, i.file.name));
    fd.append(
      "meta",
      JSON.stringify(
        items.map((i) => ({
          title: i.title,
          alt: i.alt,
          edit: i.crop ? { crop: i.crop } : undefined,
        })),
      ),
    );
    setPosting(true);
    setProgress(0);
    try {
      const { results } = await api.upload(fd, setProgress);
      const ok = results.filter((r) => r.ok);
      const failed = new Map(
        results.filter((r) => !r.ok).map((r) => [r.index, r.error.message]),
      );
      if (!failed.size) return finish(ok.map((r) => r.photo.id));
      // Lỗi từng file: giữ lại file lỗi kèm lý do, ảnh hợp lệ đã được đăng
      setItems((l) =>
        l
          .filter((_, i) => failed.has(i))
          .map((x) => ({ ...x, error: failed.get(l.indexOf(x)) })),
      );
      toast(
        ok.length
          ? `Đã đăng ${ok.length} ảnh, còn ${failed.size} ảnh chưa đăng được.`
          : "Chưa có ảnh nào được đăng, bạn xem lý do bên dưới nhé.",
        "err",
      );
    } catch (e) {
      toast(e.message, "err");
    }
    setPosting(false);
  };

  const postCamera = async (file, title) => {
    const fd = new FormData();
    fd.append("photos", file, file.name);
    fd.append("meta", JSON.stringify([{ title }]));
    setPosting(true);
    setProgress(0);
    try {
      const { results } = await api.upload(fd, setProgress);
      if (results[0].ok) return finish([results[0].photo.id]);
      toast(results[0].error.message, "err");
    } catch (e) {
      toast(e.message, "err");
    }
    setPosting(false);
  };

  return (
    <div
      className={`home ${over ? "over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={onPick}
      />
      <AnimatePresence mode="wait" initial={false}>
        {mode === "idle" && (
          <motion.div
            key="idle"
            className="home-idle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="holo display">
              Giữ lại khoảnh khắc
              <br />
              của bạn
            </h1>
            <p className="muted lead">
              Chụp một tấm, hoặc chọn ảnh từ máy. Ảnh sẽ nằm gọn trong cuốn
              album và đến tay bạn bè.
            </p>
            <div className="tiles">
              <motion.button
                className="tile cam"
                onClick={chooseCamera}
                whileHover={{ y: -6, rotate: -1.5 }}
                whileTap={{ scale: 0.96 }}
              >
                <span className="tile-ico">
                  <CamIcon size={34} strokeWidth={1.8} />
                </span>
                <b>Chụp ngay</b>
                <small>Chụp xong đăng liền</small>
              </motion.button>
              <motion.button
                className="tile up"
                onClick={chooseUpload}
                whileHover={{ y: -6, rotate: 1.5 }}
                whileTap={{ scale: 0.96 }}
              >
                <span className="tile-ico">
                  <ImagePlus size={34} strokeWidth={1.8} />
                </span>
                <b>Tải ảnh lên</b>
                <small>1–5 ảnh · JPEG, PNG</small>
              </motion.button>
            </div>
            <p className="drop-hint pixel">hoặc kéo ảnh thả vào khung</p>
          </motion.div>
        )}
        {mode === "camera" && (
          <motion.div
            key="cam"
            className="fill"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <Camera
              onClose={() => setMode("idle")}
              onPost={postCamera}
              posting={posting}
              progress={progress}
              onFallback={async (f) => {
                await addFiles(f);
                setMode("stage");
              }}
            />
          </motion.div>
        )}
        {mode === "stage" && (
          <motion.div
            key="stage"
            className="fill"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <UploadStage
              items={items}
              setItems={setItems}
              max={L.maxFiles}
              onAddClick={() => input.current?.click()}
              onPost={post}
              posting={posting}
              progress={progress}
              onClose={() => {
                items.forEach((i) => URL.revokeObjectURL(i.url));
                setItems([]);
                setMode("idle");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {over && (
        <div className="drop-overlay">
          <span className="display">Thả ảnh vào đây ✦</span>
        </div>
      )}
    </div>
  );
}
