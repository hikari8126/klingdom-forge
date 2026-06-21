import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { ForbiddenError } from "@/lib/workspaces";
import { encryptSecret, decryptSecret, getEncKey } from "@/lib/crypto";

function assertSuperAdmin(actor: CurrentUser) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
}

/** Safe listing for the admin UI — never returns secrets. */
export async function listAccountsForAdmin(actor: CurrentUser) {
  assertSuperAdmin(actor);
  return db.klingAccount.findMany({
    select: { id: true, label: true, maxConcurrent: true, enabled: true, notes: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createKlingAccount(
  actor: CurrentUser,
  input: { label: string; accessKey: string; secretKey?: string; maxConcurrent?: number },
) {
  assertSuperAdmin(actor);
  const key = getEncKey();
  const label = input.label.trim();
  if (!label) throw new Error("Label is required");
  // New API uses a single API Key (no secret); legacy uses access + secret.
  if (!input.accessKey.trim()) throw new Error("API key / access key is required");
  const secret = input.secretKey?.trim();
  return db.klingAccount.create({
    data: {
      label,
      accessKeyEnc: encryptSecret(input.accessKey.trim(), key),
      secretKeyEnc: secret ? encryptSecret(secret, key) : null,
      maxConcurrent: input.maxConcurrent && input.maxConcurrent > 0 ? input.maxConcurrent : 5,
    },
    select: { id: true, label: true },
  });
}

export async function setAccountEnabled(actor: CurrentUser, id: string, enabled: boolean) {
  assertSuperAdmin(actor);
  await db.klingAccount.update({ where: { id }, data: { enabled } });
}

/** Worker-side: enabled accounts with DECRYPTED credentials. Not for any request handler. */
export async function listEnabledAccountsDecrypted() {
  const key = getEncKey();
  const rows = await db.klingAccount.findMany({ where: { enabled: true } });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    maxConcurrent: r.maxConcurrent,
    accessKey: decryptSecret(r.accessKeyEnc, key),
    secretKey: r.secretKeyEnc ? decryptSecret(r.secretKeyEnc, key) : undefined,
  }));
}
