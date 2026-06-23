import { describe, it, expect } from "vitest";
import { workspaceHasDedicatedKlingKey } from "@/lib/workspace-keys";

describe("workspaceHasDedicatedKlingKey", () => {
  it("is false when neither a raw key nor an assigned account is set", () => {
    expect(
      workspaceHasDedicatedKlingKey({ klingApiKeyEnc: null, klingAccountId: null }),
    ).toBe(false);
  });

  it("is true with a legacy raw workspace key", () => {
    expect(
      workspaceHasDedicatedKlingKey({ klingApiKeyEnc: "enc-blob", klingAccountId: null }),
    ).toBe(true);
  });

  // Regression: assigning a key via Settings → API sets klingAccountId, not
  // klingApiKeyEnc. The warning banner used to check only klingApiKeyEnc, so it
  // never cleared after the admin followed its own instructions.
  it("is true when a shared Kling account is assigned (Settings → API flow)", () => {
    expect(
      workspaceHasDedicatedKlingKey({ klingApiKeyEnc: null, klingAccountId: "acc_1" }),
    ).toBe(true);
  });
});
