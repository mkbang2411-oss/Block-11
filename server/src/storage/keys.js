// Storage key do server tạo. Không bao giờ ghép tên file người dùng vào key.
const KEY_RE = /^(photos|avatars)\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/;
export function assertValidKey(key) {
  if (typeof key !== 'string' || key.length > 300 || !KEY_RE.test(key) || key.includes('..')) {
    const e = new Error('invalid storage key');
    e.code = 'INVALID_KEY';
    throw e;
  }
}
export const isValidKey = (key) => { try { assertValidKey(key); return true; } catch { return false; } };
