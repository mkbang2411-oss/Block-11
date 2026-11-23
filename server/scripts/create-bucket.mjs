// Tạo bucket một lần bằng tài khoản ADMIN (tài khoản app không có quyền Admin nên không tự tạo được).
// Chạy: ADMIN_ACCESS_KEY=... ADMIN_SECRET_KEY=... node scripts/create-bucket.mjs   (hoặc: npm run init:bucket)
// Đọc thêm S3_ENDPOINT, S3_REGION, S3_BUCKET (mặc định như server). Thử lại tối đa ~60 giây để chờ SeaweedFS khởi động.
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';

const env = process.env;
const endpoint = env.S3_ENDPOINT || 'http://localhost:8333';
const bucket = env.S3_BUCKET || 'gallery';
const accessKeyId = env.ADMIN_ACCESS_KEY || 'admin-dev-key';
const secretAccessKey = env.ADMIN_SECRET_KEY || 'admin-dev-secret';
const client = new S3Client({ endpoint, region: env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });

for (let i = 1; i <= 30; i++) {
  try {
    try { await client.send(new HeadBucketCommand({ Bucket: bucket })); console.log(`[bucket] "${bucket}" đã tồn tại.`); process.exit(0); }
    catch (e) { if (e?.$metadata?.httpStatusCode === 403) throw e; }
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`[bucket] đã tạo "${bucket}" tại ${endpoint}`);
    process.exit(0);
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 403) { console.error('[bucket] Bị từ chối: ADMIN_ACCESS_KEY / ADMIN_SECRET_KEY chưa đúng.'); process.exit(1); }
    console.log(`[bucket] chưa kết nối được SeaweedFS (${e.name}), thử lại ${i}/30...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.error('[bucket] Không tạo được bucket sau 60 giây.');
process.exit(1);
