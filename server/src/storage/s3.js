import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { assertValidKey } from "./keys.js";

// Dùng cho SeaweedFS (S3 gateway) hoặc bất kỳ dịch vụ S3-compatible nào (MinIO...).
export class S3Storage {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey }) {
    this.bucket = bucket;
    this.endpoint = endpoint;
    this.name = `s3:${endpoint}/${bucket}`;
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      maxAttempts: 2,
      // Tránh treo vô hạn khi SeaweedFS đơ: 5 giây để kết nối, 30 giây không có dữ liệu thì bỏ.
      requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
      credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  async init() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (e) {
      const status = e?.$metadata?.httpStatusCode;
      if (status === 403)
        throw new Error(
          `Không có quyền truy cập bucket "${this.bucket}": kiểm tra S3_ACCESS_KEY / S3_SECRET_KEY khớp seaweed/s3.json`,
        );
      // Không có phản hồi HTTP nào = chưa kết nối được SeaweedFS (không phải thiếu bucket).
      if (!status) throw unreachable(this.endpoint, e);
    }
    // Có phản hồi (404...) nghĩa là bucket chưa có.
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      if (!e?.$metadata?.httpStatusCode) throw unreachable(this.endpoint, e);
      // Tài khoản app cố ý KHÔNG có quyền Admin nên không tự tạo bucket được.
      throw new Error(
        `Bucket "${this.bucket}" chưa tồn tại. Tạo một lần bằng tài khoản admin: npm run init:bucket`,
      );
    }
  }
  // Kiểm tra nhanh kho còn sống không (dùng cho /api/health). Quá 3 giây coi như lỗi.
  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(3000),
    });
  }
  async put(key, buf, contentType = "image/webp") {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buf,
        ContentType: contentType,
      }),
    );
  }
  async get(key) {
    assertValidKey(key);
    try {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return Buffer.from(await r.Body.transformToByteArray());
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }
  async stream(key) {
    assertValidKey(key);
    try {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { body: r.Body, size: r.ContentLength };
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }
  async delete(key) {
    // S3 DeleteObject vốn idempotent
    assertValidKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
  async list(prefix = "") {
    const out = [];
    let token;
    do {
      const r = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      (r.Contents || []).forEach((o) => out.push(o.Key));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out.sort();
  }
}
const isMissing = (e) =>
  e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;

// Lỗi "chưa kết nối được kho": đáng để thử lại (khác với sai khóa / thiếu bucket).
function unreachable(endpoint, cause) {
  const err = new Error(
    `Không kết nối được SeaweedFS tại ${endpoint}. Kiểm tra weed đã chạy chưa.`,
    { cause },
  );
  err.code = "STORAGE_UNREACHABLE";
  return err;
}
