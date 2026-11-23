/* Mọi lỗi người dùng nhìn thấy đều đi qua đây: nói bằng lời bình thường, không có thuật ngữ kỹ thuật. */
const FRIENDLY = {
  network: "Mạng đang chập chờn, bạn kiểm tra lại kết nối rồi thử lại nhé.",
  unauthenticated: "Bạn cần đăng nhập trước nhé.",
  google_auth_failed: "Đăng nhập chưa thành công, bạn thử lại giúp mình nhé.",
  csrf: "Có chút trục trặc, bạn tải lại trang rồi thử lại nhé.",
  internal_error: "Mình chưa xử lý được ảnh này, bạn thử lại sau chút xíu nhé.",
  bad_email: "Địa chỉ email này chưa đúng, bạn kiểm tra lại giúp mình nhé.",
  self: "Đây là email của chính bạn rồi nè.",
  already_friends: "Hai bạn đã là bạn bè rồi.",
  already_requested:
    "Bạn đã gửi lời mời cho email này rồi, đợi bạn ấy đồng ý nhé.",
  bad_name: "Bạn nhớ nhập tên nhé, tên không được để trống.",
  bad_avatar: "Ảnh đại diện hơi nặng, bạn chọn ảnh nhẹ hơn nhé.",
  no_files: "Bạn chọn ít nhất một ảnh để đăng nhé.",
  invalid_meta: "Có chút trục trặc khi gửi ảnh, bạn thử lại nhé.",
  file_too_large: "Ảnh này nặng quá, bạn chọn ảnh nhẹ hơn nhé.",
  empty_file: "Ảnh này bị trống, bạn chọn ảnh khác nhé.",
  request_too_large:
    "Các ảnh gửi một lúc hơi nặng, bạn bớt vài ảnh rồi đăng lại nhé.",
  too_many_files: "Mỗi lần đăng được tối đa 5 ảnh thôi nhé.",
  not_multipart: "Có chút trục trặc khi gửi ảnh, bạn thử lại nhé.",
  bad_multipart: "Có chút trục trặc khi gửi ảnh, bạn thử lại nhé.",
  unsupported_type: "Mình chỉ nhận ảnh dạng JPG hoặc PNG thôi nhé.",
  corrupt_image: "Ảnh này bị lỗi nên mình không mở được, bạn thử ảnh khác nhé.",
  too_many_pixels: "Ảnh này to quá, bạn chọn ảnh nhỏ hơn nhé.",
  invalid_edit: "Chỉnh sửa này chưa dùng được, bạn thử lại nhé.",
  crop_too_small: "Vùng cắt nhỏ quá, bạn kéo rộng ra một chút nhé.",
  aspect_not_allowed:
    "Bạn cắt lại ảnh theo khung vuông hoặc khung chữ nhật nhé.",
  version_conflict:
    "Ảnh vừa được chỉnh ở nơi khác, bạn mở lại ảnh rồi sửa tiếp nhé.",
  original_missing: "Mình không tìm thấy ảnh gốc, bạn thử lại sau nhé.",
  not_found: "Mình không tìm thấy nội dung này, có thể nó đã bị xóa rồi.",
  forbidden: "Bạn cần là bạn bè mới xem được nội dung này nhé.",
  bad_emoji: "Biểu tượng cảm xúc này chưa dùng được.",
  empty_comment: "Bạn viết gì đó rồi hãy gửi nhé.",
  bad_moves: "Mình chưa đổi chỗ được ảnh, bạn thử kéo lại nhé.",
  slot_conflict: "Ô này đã có ảnh rồi, bạn thử kéo lại nhé.",
};
export function friendlyMessage(code, status, fallback) {
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  if (status === 0) return FRIENDLY.network;
  if (status >= 500) return FRIENDLY.internal_error;
  return fallback || "Có chút trục trặc, bạn thử lại nhé.";
}

export class ApiError extends Error {
  constructor(status, code, message, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}
const BASE_HEADERS = { "X-Requested-With": "gallery" };

async function req(path, { method = "GET", json, body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      body: json !== undefined ? JSON.stringify(json) : body,
      headers: {
        ...BASE_HEADERS,
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ApiError(0, "network", friendlyMessage("network", 0));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code,
      friendlyMessage(data?.error?.code, res.status, data?.error?.message),
      data,
    );
  return data;
}

// Upload bằng XHR để có tiến độ (fetch chưa có upload progress). Không tự đặt Content-Type: browser tạo boundary.
function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", path);
    x.withCredentials = true;
    x.setRequestHeader("X-Requested-With", "gallery");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    x.onerror = () =>
      reject(new ApiError(0, "network", friendlyMessage("network", 0)));
    x.onload = () => {
      let data = null;
      try {
        data = JSON.parse(x.responseText);
      } catch {
        /* ignore */
      }
      const soften = (d) => {
        d?.results?.forEach((r) => {
          if (!r.ok && r.error)
            r.error.message = friendlyMessage(
              r.error.code,
              400,
              r.error.message,
            );
        });
        return d;
      };
      if (x.status >= 200 && x.status < 300) return resolve(soften(data));
      if (data?.results) return resolve(soften(data)); // 422: mọi file lỗi nhưng vẫn có kết quả từng file
      reject(
        new ApiError(
          x.status,
          data?.error?.code,
          friendlyMessage(
            data?.error?.code,
            x.status,
            "Chưa đăng được ảnh, bạn thử lại nhé.",
          ),
          data,
        ),
      );
    };
    x.send(formData);
  });
}

export const api = {
  config: () => req("/api/config"),
  me: () => req("/api/me"),
  loginGoogle: (credential) =>
    req("/api/auth/google", { method: "POST", json: { credential } }),
  loginDev: (email, name) =>
    req("/api/auth/dev", { method: "POST", json: { email, name } }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  rename: (name) => req("/api/me", { method: "PATCH", json: { name } }),
  setAvatar: (blob) => {
    const fd = new FormData();
    fd.append("avatar", blob, "avatar.jpg");
    return upload("/api/me/avatar", fd);
  },
  resetAvatar: () => req("/api/me/avatar", { method: "DELETE" }),
  friends: () => req("/api/friends"),
  addFriend: (email) =>
    req("/api/friends/request", { method: "POST", json: { email } }),
  acceptFriend: (id) =>
    req(`/api/friends/requests/${id}/accept`, { method: "POST" }),
  dropRequest: (id) => req(`/api/friends/requests/${id}`, { method: "DELETE" }),
  unfriend: (userId) => req(`/api/friends/${userId}`, { method: "DELETE" }),
  upload: (fd, onProgress) => upload("/api/photos", fd, onProgress),
  feed: (before) =>
    req(
      `/api/feed?limit=8${before ? `&before=${encodeURIComponent(before)}` : ""}`,
    ),
  album: (userId) => req(`/api/albums/${userId || "me"}`),
  photo: (id) => req(`/api/photos/${id}`),
  patchPhoto: (id, body) =>
    req(`/api/photos/${id}`, { method: "PATCH", json: body }),
  editPhoto: (id, body) =>
    req(`/api/photos/${id}/edit`, { method: "POST", json: body }),
  deletePhoto: (id) => req(`/api/photos/${id}`, { method: "DELETE" }),
  reorder: (moves) =>
    req("/api/photos/reorder", { method: "POST", json: { moves } }),
  react: (id, emoji) =>
    req(`/api/photos/${id}/reaction`, { method: "PUT", json: { emoji } }),
  comments: (id) => req(`/api/photos/${id}/comments`),
  addComment: (id, body) =>
    req(`/api/photos/${id}/comments`, { method: "POST", json: { body } }),
  deleteComment: (id) => req(`/api/comments/${id}`, { method: "DELETE" }),
  originalUrl: (id) => `/api/photos/${id}/original`,
  downloadUrl: (id) => `/api/photos/${id}/download`,
  notifications: (before) =>
    req(`/api/notifications${before ? `?before=${before}` : ""}`),
  unreadCount: () => req("/api/notifications/unread"),
  readAllNotifications: () =>
    req("/api/notifications/read-all", { method: "POST" }),
};
