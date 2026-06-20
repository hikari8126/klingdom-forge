import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const key = "0".repeat(64); // 32-byte key as 64 hex chars

describe("encryptSecret/decryptSecret", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("my-kling-secret", key);
    expect(enc).not.toContain("my-kling-secret");
    expect(decryptSecret(enc, key)).toBe("my-kling-secret");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encryptSecret("x", key)).not.toBe(encryptSecret("x", key));
  });

  it("throws when the ciphertext is tampered", () => {
    const enc = encryptSecret("secret", key);
    const tampered = enc.slice(0, -2) + (enc.endsWith("a") ? "bb" : "aa");
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("throws when decrypting with the wrong key", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, "1".repeat(64))).toThrow();
  });
});
