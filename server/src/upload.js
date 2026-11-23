import busboy from 'busboy';
import { config } from './config.js';
import { HttpError } from './photoService.js';

/* Đọc multipart: trả về { fields, files }. Lỗi cấp REQUEST (sai cấu trúc, quá số file, quá tổng bytes) -> throw HttpError.
   Lỗi cấp FILE (vượt 10MiB) được đánh dấu truncated để xử lý riêng từng file. */
export function parseMultipart(req, { fileField, maxFiles, maxFileBytes, maxRequestBytes }) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    if (!/^multipart\/form-data;\s*boundary=/i.test(ct)) return reject(new HttpError(415, 'not_multipart', 'Request phải là multipart/form-data.'));
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > maxRequestBytes) return reject(new HttpError(413, 'request_too_large', `Tổng dung lượng vượt ${maxRequestBytes / 1048576} MiB.`));

    let bb;
    try { bb = busboy({ headers: req.headers, limits: { files: maxFiles, fileSize: maxFileBytes, fields: 40, fieldSize: 256 * 1024, parts: maxFiles + 45 } }); }
    catch { return reject(new HttpError(400, 'bad_multipart', 'Multipart không hợp lệ.')); }

    const fields = {}; const files = [];
    let received = 0; let failed = null;
    const fail = (err) => { if (failed) return; failed = err; req.unpipe(bb); req.resume(); reject(err); };

    req.on('data', (c) => { received += c.length; if (received > maxRequestBytes) fail(new HttpError(413, 'request_too_large', `Tổng dung lượng vượt ${maxRequestBytes / 1048576} MiB.`)); });
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('file', (name, stream, info) => {
      if (name !== fileField) return stream.resume();
      const chunks = []; let truncated = false;
      stream.on('data', (c) => chunks.push(c));
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => files.push({ filename: info.filename || '', mime: info.mimeType, buffer: Buffer.concat(chunks), truncated }));
    });
    bb.on('filesLimit', () => fail(new HttpError(400, 'too_many_files', `Tối đa ${maxFiles} ảnh mỗi lần gửi.`)));
    bb.on('error', () => fail(new HttpError(400, 'bad_multipart', 'Multipart không hợp lệ.')));
    bb.on('close', () => { if (!failed) resolve({ fields, files }); });
    req.pipe(bb);
  });
}
export const limitsFor = () => ({ maxFiles: config.limits.maxFiles, maxFileBytes: config.limits.maxFileBytes, maxRequestBytes: config.limits.maxRequestBytes });
