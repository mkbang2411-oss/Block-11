import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEscape } from '../lib/hooks.js';

// Khung modal dùng chung: nền mờ + thẻ nảy nhẹ
export default function Modal({ onClose, title, children, wide, className = '' }) {
  useEscape(onClose);
  return createPortal(
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}
        initial={{ opacity: 0, y: 30, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}>
        <div className="modal-bar">
          <span className="modal-title">{title}</span>
          <button className="icon-btn sm" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
