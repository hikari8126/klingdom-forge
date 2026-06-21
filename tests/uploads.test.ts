import { describe, it, expect } from "vitest";
import { safeExt, assetStoredPath, isVideoExt, mimeForFilename, assertVideoSize } from "@/lib/uploads";

describe("safeExt", () => {
  it("keeps common image extensions (lowercased)", () => {
    expect(safeExt("photo.JPG")).toBe(".jpg");
    expect(safeExt("a.png")).toBe(".png");
    expect(safeExt("x.webp")).toBe(".webp");
  });
  it("keeps video extensions", () => {
    expect(safeExt("clip.mp4")).toBe(".mp4");
    expect(safeExt("motion.MOV")).toBe(".mov");
  });
  it("falls back to .png for unknown/missing extensions", () => {
    expect(safeExt("noext")).toBe(".png");
    expect(safeExt("evil.svg")).toBe(".png");
    expect(safeExt("a.exe")).toBe(".png");
  });
});

describe("isVideoExt", () => {
  it("returns true for .mp4 and .mov", () => {
    expect(isVideoExt("clip.mp4")).toBe(true);
    expect(isVideoExt("motion.MOV")).toBe(true);
  });
  it("returns false for image extensions", () => {
    expect(isVideoExt("photo.jpg")).toBe(false);
    expect(isVideoExt("image.png")).toBe(false);
  });
});

describe("mimeForFilename", () => {
  it("returns correct MIME types", () => {
    expect(mimeForFilename("a.png")).toBe("image/png");
    expect(mimeForFilename("b.jpg")).toBe("image/jpeg");
    expect(mimeForFilename("c.mp4")).toBe("video/mp4");
    expect(mimeForFilename("d.mov")).toBe("video/quicktime");
  });
  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeForFilename("a.xyz")).toBe("application/octet-stream");
  });
});

describe("assertVideoSize", () => {
  it("does not throw for a small buffer", () => {
    expect(() => assertVideoSize(Buffer.alloc(1024), "small.mp4")).not.toThrow();
  });
  it("throws for a buffer exceeding 100 MB", () => {
    const big = Buffer.alloc(101 * 1024 * 1024);
    expect(() => assertVideoSize(big, "big.mp4")).toThrow(/100 MB/);
  });
});

describe("assetStoredPath", () => {
  it("builds <root>/<projectId>/<assetId><ext>", () => {
    expect(assetStoredPath("/data/up", "proj1", "asset9", "pic.jpeg")).toBe("/data/up/proj1/asset9.jpeg");
  });
  it("sanitizes a filename with no real extension to .png (id is app-generated, path stays in root)", () => {
    expect(assetStoredPath("/data/up", "proj1", "asset9", "../../etc/passwd")).toBe("/data/up/proj1/asset9.png");
  });
});
