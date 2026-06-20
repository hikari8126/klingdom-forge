import { createHmac } from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Sign a Kling API JWT (HS256). Pass the current UNIX time in seconds as
 * `nowSeconds` (injected for deterministic testing). Token is valid for 30 min.
 */
export function signKlingJwt(
  accessKey: string,
  secretKey: string,
  nowSeconds: number,
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { iss: accessKey, exp: nowSeconds + 1800, nbf: nowSeconds - 5 };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;
  const signature = base64url(
    createHmac("sha256", secretKey).update(signingInput).digest(),
  );
  return `${signingInput}.${signature}`;
}
