import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signKlingJwt } from "@/lib/kling/jwt";

function decodeSegment(seg: string): Record<string, unknown> {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

const ak = "test-access-key";
const sk = "test-secret-key";
const now = 1_700_000_000;

describe("signKlingJwt", () => {
  it("produces a 3-part JWT with an HS256 header", () => {
    const parts = signKlingJwt(ak, sk, now).split(".");
    expect(parts).toHaveLength(3);
    expect(decodeSegment(parts[0])).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("sets iss=accessKey, exp=now+1800, nbf=now-5", () => {
    const payload = decodeSegment(signKlingJwt(ak, sk, now).split(".")[1]);
    expect(payload).toEqual({ iss: ak, exp: now + 1800, nbf: now - 5 });
  });

  it("signature is the HS256 HMAC of `header.payload` using the secret key", () => {
    const [h, p, sig] = signKlingJwt(ak, sk, now).split(".");
    const expected = createHmac("sha256", sk)
      .update(`${h}.${p}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(sig).toBe(expected);
  });

  it("a different secret key yields a different signature", () => {
    const a = signKlingJwt(ak, sk, now).split(".")[2];
    const b = signKlingJwt(ak, "other-secret", now).split(".")[2];
    expect(a).not.toBe(b);
  });
});
