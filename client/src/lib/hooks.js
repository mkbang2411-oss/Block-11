import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [v, setV] = useState(get);
  useEffect(() => {
    let raf;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setV(get())); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return v;
}

export function useElementSize() {
  const ref = useRef(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setS({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, s];
}

export function useEscape(fn, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const on = (e) => { if (e.key === 'Escape') fn(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [fn, active]);
}

export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
