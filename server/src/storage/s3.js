import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  ListObjectsV2Command, HeadBucketCommand, CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { assertValidKey } from './keys.js';

// Dùng cho SeaweedFS (S3 gateway) hoặc bất kỳ dịch vụ S3-compatible nào (MinIO...).
export class S3Storage {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey }) {
    this.bucket = bucket;
    this.name = `s3:${endpoint}/${bucket}`;
    this.client = new S3Client({
      endpoint, region, forcePathStyle: true,
      credentials: accessKeyId ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  async init() {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
  async put(key, buf, contentType = 'image/webp') {
    assertValidKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf, ContentType: contentType }));
  }
  async get(key) {
    assertValidKey(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body.transformToByteArray());
    } catch (e) { if (isMissing(e)) return null; throw e; }
  }
  async stream(key) {
    assertValidKey(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return { body: r.Body, size: r.ContentLength };
    } catch (e) { if (isMissing(e)) return null; throw e; }
  }
  async delete(key) { // S3 DeleteObject vốn idempotent
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async list(prefix = '') {
    const out = []; let token;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }));
      (r.Contents || []).forEach((o) => out.push(o.Key));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out.sort();
  }
}
const isMissing = (e) => e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
