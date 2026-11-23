import { useEffect, useState } from 'react';

// Router tối giản bằng History API (CSR). Các trang: /  /feed  /album  /album/:userId  /me
export function parse(url) {
  const u = new URL(url, window.location.origin);
  const seg = u.pathname.split('/').filter(Boolean);
  let page = 'home', userId = null;
  if (seg[0] === 'feed') page = 'feed';
  else if (seg[0] === 'album') { page = 'album'; userId = seg[1] || null; }
  else if (seg[0] === 'me') page = 'profile';
  return { page, userId, search: u.searchParams, path: u.pathname + u.search };
}

export function navigate(to, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
  window.dispatchEvent(new Event('app:navigate'));
}

export function useRoute() {
  const [r, setR] = useState(() => parse(window.location.href));
  useEffect(() => {
    const on = () => setR(parse(window.location.href));
    window.addEventListener('popstate', on);
    window.addEventListener('app:navigate', on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener('app:navigate', on); };
  }, []);
  return r;
}
