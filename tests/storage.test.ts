import { describe, it, expect, vi } from "vitest";
import {
  loadStorageConfig,
  publicUrlFor,
  createStorageProvider,
  type StorageConfig,
} from "@/lib/storage";

const FULL_ENV = {
  S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com",
  S3_BUCKET: "klingdom",
  S3_ACCESS_KEY: "ak",
  S3_SECRET_KEY: "sk",
  S3_PUBLIC_URL: "https://pub-xxx.r2.dev",
} as unknown as NodeJS.ProcessEnv;

const CONFIG: StorageConfig = {
  endpoint: FULL_ENV.S3_ENDPOINT!,
  bucket: "klingdom",
  accessKey: "ak",
  secretKey: "sk",
  publicUrl: "https://pub-xxx.r2.dev",
};

describe("loadStorageConfig", () => {
  it("reads all five vars when present", () => {
    expect(loadStorageConfig(FULL_ENV)).toEqual(CONFIG);
  });

  it("throws naming every missing var", () => {
    expect(() => loadStorageConfig({ S3_BUCKET: "b" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /S3_ENDPOINT.*S3_ACCESS_KEY.*S3_SECRET_KEY.*S3_PUBLIC_URL/,
    );
  });

  it("treats blank/whitespace as missing", () => {
    expect(() => loadStorageConfig({ ...FULL_ENV, S3_PUBLIC_URL: "   " })).toThrow(/S3_PUBLIC_URL/);
  });
});

describe("publicUrlFor", () => {
  it("composes base + key", () => {
    expect(publicUrlFor(CONFIG, "assets/p1/a1.png")).toBe(
      "https://pub-xxx.r2.dev/assets/p1/a1.png",
    );
  });

  it("collapses stray slashes between base and key", () => {
    expect(publicUrlFor({ publicUrl: "https://x.dev/" }, "/assets/a.mp4")).toBe(
      "https://x.dev/assets/a.mp4",
    );
  });
});

describe("createStorageProvider", () => {
  it("put issues a PutObject with bucket/key/body", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createStorageProvider(CONFIG, { send } as never);
    await provider.put("assets/p1/a1.png", Buffer.from("hi"), "image/png");
    const cmd = send.mock.calls[0][0].input;
    expect(cmd).toMatchObject({ Bucket: "klingdom", Key: "assets/p1/a1.png", ContentType: "image/png" });
  });

  it("read returns bytes from the object body", async () => {
    const send = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const provider = createStorageProvider(CONFIG, { send } as never);
    expect(await provider.read("k")).toEqual(Buffer.from([1, 2, 3]));
  });

  it("delete([]) is a no-op (no S3 call)", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createStorageProvider(CONFIG, { send } as never);
    await provider.delete([]);
    expect(send).not.toHaveBeenCalled();
  });

  it("delete maps keys into a DeleteObjects batch", async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = createStorageProvider(CONFIG, { send } as never);
    await provider.delete(["a", "b"]);
    const cmd = send.mock.calls[0][0].input;
    expect(cmd.Delete.Objects).toEqual([{ Key: "a" }, { Key: "b" }]);
  });
});
