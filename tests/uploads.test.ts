import { describe, it, expect } from "vitest";
import { safeExt, assetStoredPath } from "@/lib/uploads";

describe("safeExt", () => {
  it("keeps common image extensions (lowercased)", () => {
    expect(safeExt("photo.JPG")).toBe(".jpg");
    expect(safeExt("a.png")).toBe(".png");
    expect(safeExt("x.webp")).toBe(".webp");
  });
  it("falls back to .png for unknown/missing extensions", () => {
    expect(safeExt("noext")).toBe(".png");
    expect(safeExt("evil.svg")).toBe(".png");
    expect(safeExt("a.exe")).toBe(".png");
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
