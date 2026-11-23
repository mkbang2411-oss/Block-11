import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api.js';
import { useApp } from '../store.jsx';

// Thả cảm xúc: bấm lại cùng emoji để bỏ. Cập nhật lạc quan, lỗi thì hoàn lại.
export default function Reactions({ photo, onChange, compact }) {
  const { config, toast } = useApp();
  const [pop, setPop] = useState(null);
  const emojis = config?.emojis || [];
  const { counts, mine } = photo.reactions;

  const react = async (emoji) => {
    const prev = photo.reactions;
    const next = { counts: { ...prev.counts }, mine: prev.mine === emoji ? null : emoji };
    if (prev.mine) next.counts[prev.mine] = Math.max(0, (next.counts[prev.mine] || 1) - 1);
    if (next.mine) next.counts[emoji] = (next.counts[emoji] || 0) + 1;
    Object.keys(next.counts).forEach((k) => { if (!next.counts[k]) delete next.counts[k]; });
    onChange({ ...photo, reactions: next });
    setPop(next.mine ? emoji : null);
    try { const r = await api.react(photo.id, emoji); onChange({ ...photo, reactions: r.reactions }); }
    catch (e) { onChange({ ...photo, reactions: prev }); toast(e.message, 'err'); }
  };

  return (
    <div className={`reactions ${compact ? 'compact' : ''}`} role="group" aria-label="Cảm xúc">
      {emojis.map((e) => (
        <motion.button key={e} className={`react ${mine === e ? 'on' : ''}`} onClick={() => react(e)} whileTap={{ scale: 0.8 }}
          animate={pop === e && mine === e ? { scale: [1, 1.35, 1], rotate: [0, -10, 8, 0] } : {}} transition={{ duration: 0.45 }}
          aria-pressed={mine === e} aria-label={`${e} ${counts[e] || 0}`}>
          <span className="emo">{e}</span>{counts[e] ? <b>{counts[e]}</b> : null}
        </motion.button>
      ))}
    </div>
  );
}
