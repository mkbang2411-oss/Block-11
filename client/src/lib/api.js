export class ApiError extends Error {
  constructor(status, code, message, data) { super(message); this.status = status; this.code = code; this.data = data; }
}
const BASE_HEADERS = { 'X-Requested-With': 'gallery' };

async function req(path, { method = 'GET', json, body } = {}) {
  const res = await fetch(path, {
    method, credentials: 'same-origin', body: json !== undefined ? JSON.stringify(json) : body,
    headers: { ...BASE_HEADERS, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code, data?.error?.message || 'Có lỗi xảy ra, thử lại nhé.', data);
  return data;
}

// Upload bằng XHR để có tiến độ (fetch chưa có upload progress). Không tự đặt Content-Type: browser tạo boundary.
function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', path);
    x.withCredentials = true;
    x.setRequestHeader('X-Requested-With', 'gallery');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    x.onerror = () => reject(new ApiError(0, 'network', 'Mất kết nối mạng.'));
    x.onload = () => {
      let data = null; try { data = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status >= 200 && x.status < 300) return resolve(data);
      if (data?.results) return resolve(data); // 422: mọi file lỗi nhưng vẫn có kết quả từng file
      reject(new ApiError(x.status, data?.error?.code, data?.error?.message || 'Không tải ảnh lên được.', data));
    };
    x.send(formData);
  });
}

export const api = {
  config: () => req('/api/config'),
  me: () => req('/api/me'),
  loginGoogle: (credential) => req('/api/auth/google', { method: 'POST', json: { credential } }),
  loginDev: (email, name) => req('/api/auth/dev', { method: 'POST', json: { email, name } }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  rename: (name) => req('/api/me', { method: 'PATCH', json: { name } }),
  setAvatar: (blob) => { const fd = new FormData(); fd.append('avatar', blob, 'avatar.jpg'); return upload('/api/me/avatar', fd); },
  resetAvatar: () => req('/api/me/avatar', { method: 'DELETE' }),
  friends: () => req('/api/friends'),
  addFriend: (email) => req('/api/friends/request', { method: 'POST', json: { email } }),
  acceptFriend: (id) => req(`/api/friends/requests/${id}/accept`, { method: 'POST' }),
  dropRequest: (id) => req(`/api/friends/requests/${id}`, { method: 'DELETE' }),
  unfriend: (userId) => req(`/api/friends/${userId}`, { method: 'DELETE' }),
  upload: (fd, onProgress) => upload('/api/photos', fd, onProgress),
  feed: (before) => req(`/api/feed?limit=8${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  album: (userId) => req(`/api/albums/${userId || 'me'}`),
  photo: (id) => req(`/api/photos/${id}`),
  patchPhoto: (id, body) => req(`/api/photos/${id}`, { method: 'PATCH', json: body }),
  editPhoto: (id, body) => req(`/api/photos/${id}/edit`, { method: 'POST', json: body }),
  deletePhoto: (id) => req(`/api/photos/${id}`, { method: 'DELETE' }),
  reorder: (moves) => req('/api/photos/reorder', { method: 'POST', json: { moves } }),
  react: (id, emoji) => req(`/api/photos/${id}/reaction`, { method: 'PUT', json: { emoji } }),
  comments: (id) => req(`/api/photos/${id}/comments`),
  addComment: (id, body) => req(`/api/photos/${id}/comments`, { method: 'POST', json: { body } }),
  deleteComment: (id) => req(`/api/comments/${id}`, { method: 'DELETE' }),
  originalUrl: (id) => `/api/photos/${id}/original`,
  downloadUrl: (id) => `/api/photos/${id}/download`,
};
