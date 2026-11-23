import { useMemo } from 'react';

// Nền trơn có màu động: navy -> indigo, các đốm holographic pastel trôi chậm, bong bóng, sao lấp lánh, đèn dây.
const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const BULBS = ['#ff9ad5', '#8ff0ff', '#ffd36e', '#b9a4ff', '#9bf5c9', '#ff9f80'];

function Lights() {
  const arcs = 6, per = 5; const bulbs = []; let d = '';
  for (let a = 0; a < arcs; a++) {
    const x0 = (a / arcs) * 100, x1 = ((a + 1) / arcs) * 100;
    d += `${a === 0 ? 'M' : ''}${a === 0 ? `${x0},0 ` : ''}Q${(x0 + x1) / 2},30 ${x1},0 `;
    for (let i = 1; i <= per; i++) {
      const t = i / (per + 1);
      bulbs.push({ x: x0 + t * (x1 - x0), y: 2 * t * (1 - t) * 30, c: BULBS[(a * per + i) % BULBS.length], delay: ((a * per + i) % 7) * 0.45 });
    }
  }
  return (
    <div className="lights">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d={d} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" /></svg>
      {bulbs.map((b, i) => (
        <span key={i} className="bulb" style={{ left: `${b.x}%`, top: `${b.y + 2}px`, '--c': b.c, animationDelay: `${b.delay}s` }} />
      ))}
    </div>
  );
}

export default function Background({ page }) {
  const stars = useMemo(() => { const r = rnd(7); return Array.from({ length: 30 }, () => ({ l: r() * 100, t: r() * 100, s: 6 + r() * 12, d: r() * 5, k: 2.5 + r() * 3 })); }, []);
  const bubbles = useMemo(() => { const r = rnd(21); return Array.from({ length: 9 }, () => ({ l: r() * 100, s: 60 + r() * 150, d: r() * -40, k: 38 + r() * 40 })); }, []);
  return (
    <div className="bg" data-page={page} aria-hidden="true">
      <div className="blobs">
        <div className="blob-pos p1"><div className="blob b1" /></div>
        <div className="blob-pos p2"><div className="blob b2" /></div>
        <div className="blob-pos p3"><div className="blob b3" /></div>
        <div className="blob-pos p4"><div className="blob b4" /></div>
        <div className="blob-pos p5"><div className="blob b5" /></div>
      </div>
      {bubbles.map((b, i) => (
        <span key={i} className="bubble" style={{ left: `${b.l}%`, width: b.s, height: b.s, animationDuration: `${b.k}s`, animationDelay: `${b.d}s` }} />
      ))}
      {stars.map((s, i) => (
        <span key={i} className="star" style={{ left: `${s.l}%`, top: `${s.t}%`, fontSize: s.s, animationDelay: `${s.d}s`, animationDuration: `${s.k}s` }}>✦</span>
      ))}
      <Lights />
      <div className="grain" />
    </div>
  );
}
