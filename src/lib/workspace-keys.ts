/**
 * Whether a workspace has dedicated Kling credentials assigned to it.
 *
 * A workspace can be generated against with dedicated credentials when it has
 * EITHER a legacy raw workspace-level Kling API key (`klingApiKeyEnc`) OR an
 * assigned shared Kling account (`klingAccountId`). This mirrors the worker's
 * credential resolution order in `src/worker/dispatcher.ts`, where an assigned
 * account takes priority over the raw workspace key.
 *
 * NOTE: the only UI path for assigning a key (Settings → API → "Gán key cho
 * workspace") sets `klingAccountId`, never `klingApiKeyEnc`. Checking only the
 * raw key would make the "no key assigned" warning impossible to clear.
 */
export function workspaceHasDedicatedKlingKey(workspace: {
  klingApiKeyEnc: string | null;
  klingAccountId: string | null;
}): boolean {
  return Boolean(workspace.klingApiKeyEnc || workspace.klingAccountId);
}
