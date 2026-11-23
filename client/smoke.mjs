import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const g = globalThis;
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'URL', 'FormData', 'File', 'Blob', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'MutationObserver', 'SVGElement', 'HTMLInputElement', 'DocumentFragment', 'CustomEvent', 'AbortController', 'AbortSignal', 'PointerEvent']) {
  try { Object.defineProperty(g, k, { value: dom.window[k] ?? g[k], configurable: true, writable: true }); } catch {}
}
g.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
g.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ contentRect: { width: 1000, height: 640 } }]); } disconnect() {} };
g.IntersectionObserver = class { observe() {} disconnect() {} };
g.window.ResizeObserver = g.ResizeObserver; g.window.IntersectionObserver = g.IntersectionObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.setPointerCapture = () => {};
window.innerWidth = 1280; window.innerHeight = 800;

const variants = (id) => [320, 960].map((w) => ({ width: w, height: w * 0.75, bytes: 1000, url: `/media/photos/${id}/v1/${w}.webp` }));
const mk = (id, aspect, slot) => ({ id, title: 'T' + id, alt: 'alt', aspect, width: 960, height: 720, slot, version: 1, createdAt: Date.now() - slot * 1000, updatedAt: 1, edit: { crop: null, rotate: 0, flip: false, filter: 'none' }, edited: false, owner: { id: 'u1', name: 'An', avatarUrl: null }, variants: variants(id), reactions: { counts: { '❤️': 2 }, mine: null }, commentCount: 1 });
const photos = [mk('a', '3:4', 0), mk('b', '1:1', 1), mk('c', '4:3', 2)];
const me = { id: 'u1', name: 'An', email: 'an@gmail.com', avatarUrl: null };
const routes = {
  '/api/config': { googleClientId: null, devLogin: true, emojis: ['❤️', '😆'], limits: { maxFiles: 5, maxFileBytes: 10485760, maxRequestBytes: 57671680, slotsPerPage: 6 } },
  '/api/me': { user: me },
  '/api/friends': { friends: [{ ...me, id: 'u2', name: 'Linh', latestPhotoAt: 1 }], incoming: [{ requestId: 1, from: { ...me, id: 'u3', name: 'Bo' } }], outgoing: [{ requestId: 2, email: 'x@gmail.com' }] },
  '/api/feed': { photos, next: null },
  '/api/albums/me': { owner: me, isMine: true, photos, startPage: 0 },
  '/api/albums/u2': { owner: { ...me, id: 'u2', name: 'Linh' }, isMine: false, photos, startPage: 0 },
};
g.fetch = async (url) => { const u = String(url).split('?')[0]; const body = routes[u] ?? (u.endsWith('/comments') ? { comments: [{ id: 1, body: 'xinh', createdAt: 1, author: me, canDelete: true }] } : {}); return { ok: true, status: 200, json: async () => body }; };

const errors = [];
const ce = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); };
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const act = React.act;
const { AppProvider } = await vite.ssrLoadModule('/src/store.jsx');
const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
const { navigate } = await vite.ssrLoadModule('/src/lib/router.js');

const root = createRoot(document.getElementById('root'));
const tick = (ms = 80) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
await act(async () => { root.render(React.createElement(AppProvider, null, React.createElement(App))); });
await tick(300);
const txt = () => document.body.textContent.replace(/\s+/g, ' ');
const check = (name, cond) => console.log(cond ? 'PASS' : 'FAIL', name);

check('home tiles', txt().includes('Chụp ngay') && txt().includes('Tải ảnh lên'));
for (const [path, probe] of [['/feed', 'Thêm bạn'], ['/album', 'trang 1'], ['/album/u2', 'Album của'], ['/me', 'Kết bạn bằng Gmail'], ['/', 'Chụp ngay']]) {
  await act(async () => { navigate(path); }); await tick(700);
  check(`page ${path} -> "${probe}"`, txt().includes(probe));
}
await act(async () => { navigate('/album'); }); await tick(700);
console.log('cards in album:', document.querySelectorAll('.card').length, 'rotated:', document.querySelectorAll('[data-rotated="1"]').length);
const card = document.querySelector('.card[data-photo-id="c"]');
await act(async () => { card.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await tick(300);
check('viewer opens with comments + actions', !!document.querySelector('.viewer') && txt().includes('Chỉnh sửa') && txt().includes('Tải về') && txt().includes('xinh'));
const img = document.querySelector('.viewer-card img'); console.log('viewer img srcset:', img?.getAttribute('srcset'), 'sizes:', img?.getAttribute('sizes'), 'w/h/alt/loading:', img?.getAttribute('width'), img?.getAttribute('height'), img?.getAttribute('alt'), img?.getAttribute('loading'));
await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Chỉnh sửa')).click(); }); await tick(200);
check('editor modal opens', !!document.querySelector('.editor'));
console.log('console.error count:', errors.length); errors.slice(0, 8).forEach((e) => console.log(' -', e));
await vite.close(); process.exit(0);
