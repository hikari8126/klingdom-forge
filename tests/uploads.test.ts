import { describe, it, expect } from "vitest";
import { safeExt, assetKey, libraryKey, thumbKey, isAudioExt, isVideoExt, mimeForFilename, assertAudioSize, assertVideoSize } from "@/lib/uploads";

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
  it("keeps audio extensions", () => {
    expect(safeExt("voice.MP3")).toBe(".mp3");
    expect(safeExt("sound.m4a")).toBe(".m4a");
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

describe("isAudioExt", () => {
  it("returns true for supported audio files", () => {
    expect(isAudioExt("voice.mp3")).toBe(true);
    expect(isAudioExt("line.WAV")).toBe(true);
  });
  it("returns false for non-audio extensions", () => {
    expect(isAudioExt("clip.mp4")).toBe(false);
    expect(isAudioExt("photo.jpg")).toBe(false);
  });
});

describe("mimeForFilename", () => {
  it("returns correct MIME types", () => {
    expect(mimeForFilename("a.png")).toBe("image/png");
    expect(mimeForFilename("b.jpg")).toBe("image/jpeg");
    expect(mimeForFilename("c.mp4")).toBe("video/mp4");
    expect(mimeForFilename("d.mov")).toBe("video/quicktime");
    expect(mimeForFilename("e.mp3")).toBe("audio/mpeg");
    expect(mimeForFilename("f.m4a")).toBe("audio/mp4");
  });
  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeForFilename("a.xyz")).toBe("application/octet-stream");
  });
});

describe("assertAudioSize", () => {
  it("does not throw for a small buffer", () => {
    expect(() => assertAudioSize(Buffer.alloc(1024), "small.mp3")).not.toThrow();
  });
  it("throws for a buffer exceeding 5 MB", () => {
    const big = Buffer.alloc(6 * 1024 * 1024);
    expect(() => assertAudioSize(big, "big.mp3")).toThrow(/5 MB/);
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

describe("assetKey / thumbKey / libraryKey", () => {
  it("builds assets/<projectId>/<assetId><ext>", () => {
    expect(assetKey("proj1", "asset9", "pic.jpeg")).toBe("assets/proj1/asset9.jpeg");
  });
  it("sanitizes a filename with no real extension to .png (id is app-generated, key stays in prefix)", () => {
    expect(assetKey("proj1", "asset9", "../../etc/passwd")).toBe("assets/proj1/asset9.png");
  });
  it("derives a webp thumbnail key under thumbs/", () => {
    expect(thumbKey("proj1", "asset9")).toBe("thumbs/proj1/asset9.webp");
  });
  it("builds library/<id><ext>", () => {
    expect(libraryKey("lib1", "ref.mp4")).toBe("library/lib1.mp4");
  });
});
