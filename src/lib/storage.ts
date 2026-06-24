import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

/**
 * Object storage on Cloudflare R2 (S3-compatible). R2-only — there is no
 * local-disk fallback; the app fails fast at init if the S3_* env vars are
 * missing. The env vars are named S3_* because R2 speaks the S3 API; the same
 * code works against any S3-compatible store.
 *
 * Two distinct URLs are in play:
 *  - S3_ENDPOINT  — authenticated API for writing/reading objects (this client)
 *  - S3_PUBLIC_URL — public bucket domain Kling fetches from (publicUrl())
 */

export type StorageConfig = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  publicUrl: string;
};

const ENV_KEYS = {
  endpoint: "S3_ENDPOINT",
  bucket: "S3_BUCKET",
  accessKey: "S3_ACCESS_KEY",
  secretKey: "S3_SECRET_KEY",
  publicUrl: "S3_PUBLIC_URL",
} as const;

/** Validate + read the 5 S3_* vars. Throws naming every missing var (fail-fast). */
export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const missing: string[] = [];
  const get = (k: keyof typeof ENV_KEYS): string => {
    const v = env[ENV_KEYS[k]];
    if (!v || !v.trim()) missing.push(ENV_KEYS[k]);
    return (v ?? "").trim();
  };
  const cfg: StorageConfig = {
    endpoint: get("endpoint"),
    bucket: get("bucket"),
    accessKey: get("accessKey"),
    secretKey: get("secretKey"),
    publicUrl: get("publicUrl"),
  };
  if (missing.length) {
    throw new Error(
      `Object storage chưa cấu hình: thiếu ${missing.join(", ")}. ` +
        `Điền các biến S3_* (Cloudflare R2) vào .env.`,
    );
  }
  return cfg;
}

/** Compose the public URL Kling fetches from. Tolerates trailing/leading slashes. */
export function publicUrlFor(config: Pick<StorageConfig, "publicUrl">, key: string): string {
  const base = config.publicUrl.replace(/\/+$/, "");
  const rel = key.replace(/^\/+/, "");
  return `${base}/${rel}`;
}

export interface StorageProvider {
  put(key: string, bytes: Buffer, contentType?: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  publicUrl(key: string): string;
  delete(keys: string[]): Promise<void>;
}

/** Build an R2-backed provider from a validated config + S3 client. */
export function createStorageProvider(config: StorageConfig, client: S3Client): StorageProvider {
  return {
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    },
    async read(key) {
      const out = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      const bytes = await out.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    publicUrl(key) {
      return publicUrlFor(config, key);
    },
    async delete(keys) {
      if (keys.length === 0) return; // no-op
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    },
  };
}

let cached: StorageProvider | null = null;

/** Lazily-built singleton provider for app/worker use. */
export function getStorage(): StorageProvider {
  if (cached) return cached;
  const config = loadStorageConfig();
  const client = new S3Client({
    region: "auto", // R2 ignores region but the SDK requires one
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });
  cached = createStorageProvider(config, client);
  return cached;
}
