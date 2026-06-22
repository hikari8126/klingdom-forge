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

/** Count of enabled accounts (no secrets) — used to warn when generation can't run. */
export async function countEnabledAccounts(): Promise<number> {
  return db.klingAccount.count({ where: { enabled: true } });
}

export async function setAccountEnabled(actor: CurrentUser, id: string, enabled: boolean) {
  assertSuperAdmin(actor);
  await db.klingAccount.update({ where: { id }, data: { enabled } });
}

/** Delete a Kling key (account). Super Admin only. Workspace assignments clear via FK SetNull. */
export async function deleteKlingAccount(actor: CurrentUser, id: string) {
  assertSuperAdmin(actor);
  await db.klingAccount.delete({ where: { id } });
}

/** Assign a Kling key (account) to a workspace, or pass null to clear. Super Admin only. */
export async function assignAccountToWorkspace(
  actor: CurrentUser,
  workspaceId: string,
  accountId: string | null,
) {
  assertSuperAdmin(actor);
  if (accountId) {
    const exists = await db.klingAccount.findUnique({ where: { id: accountId }, select: { id: true } });
    if (!exists) throw new Error("Key không tồn tại");
  }
  await db.workspace.update({ where: { id: workspaceId }, data: { klingAccountId: accountId } });
}

/** Worker-side: the workspace's assigned account (decrypted) for a project, or null. */
export async function getAssignedAccountForProject(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspace: { select: { klingAccount: true } } },
  });
  const acc = project?.workspace.klingAccount;
  if (!acc || !acc.enabled) return null;
  const key = getEncKey();
  return {
    id: acc.id,
    label: acc.label,
    maxConcurrent: acc.maxConcurrent,
    accessKey: decryptSecret(acc.accessKeyEnc, key),
    secretKey: acc.secretKeyEnc ? decryptSecret(acc.secretKeyEnc, key) : undefined,
  };
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
