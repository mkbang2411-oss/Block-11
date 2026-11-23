import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../store.jsx';

export default function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.kind}`} layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
