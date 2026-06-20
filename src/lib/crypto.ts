import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM. `keyHex` is 64 hex chars (32 bytes). Output: hex iv:tag:ciphertext. */
export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decryptSecret(enc: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = enc.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("Malformed ciphertext");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Reads the app encryption key from env (64 hex chars). Throws if missing/invalid. */
export function getEncKey(): string {
  const k = process.env.KLING_ENC_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("KLING_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return k;
}
