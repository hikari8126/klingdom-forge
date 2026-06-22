/** Minimum number of empty placeholders shown for a fresh cell. Real outputs are unlimited. */
export const MIN_OUTPUT_SLOT_COUNT = 5;
export const OUTPUT_SLOT_COUNT = MIN_OUTPUT_SLOT_COUNT; // Back-compat for older UI imports.

export type OutputSlotStatus = "idle" | "queued" | "submitted" | "processing" | "succeeded" | "failed";

export const ACTIVE_OUTPUT_STATUSES: OutputSlotStatus[] = ["queued", "submitted", "processing"];

export function normalizeOutputSlots(
  raw?: Array<string | null>,
  fallbackUrl?: string | null,
): Array<string | null> {
  const source = raw && raw.length > 0 ? raw : fallbackUrl ? [fallbackUrl] : [];
  const length = Math.max(MIN_OUTPUT_SLOT_COUNT, source.length);
  return Array.from({ length }, (_, i) => source[i] ?? null);
}

export function normalizeSlotStatuses(
  raw?: Array<OutputSlotStatus | string | null>,
  slots?: Array<string | null>,
): OutputSlotStatus[] {
  const length = Math.max(MIN_OUTPUT_SLOT_COUNT, slots?.length ?? 0, raw?.length ?? 0);
  return Array.from({ length }, (_, i) => {
    const s = raw?.[i];
    if (s === "queued" || s === "submitted" || s === "processing" || s === "succeeded" || s === "failed") return s;
    return slots?.[i] ? "succeeded" : "idle";
  });
}

export function normalizeSlotErrors(raw?: Array<string | null>): Array<string | null> {
  const length = Math.max(MIN_OUTPUT_SLOT_COUNT, raw?.length ?? 0);
  return Array.from({ length }, (_, i) => raw?.[i] ?? null);
}

export function clampOutputSlot(slot: number): number {
  return Math.max(0, Math.floor(slot));
}

export function isActiveOutputStatus(status: OutputSlotStatus | string | null | undefined): boolean {
  return status === "queued" || status === "submitted" || status === "processing";
}

export function firstEmptyOutputSlot(slots: Array<string | null>, statuses?: Array<OutputSlotStatus | string | null>): number {
  const firstEmpty = slots.findIndex((url, i) => !url && !isActiveOutputStatus(statuses?.[i]));
  if (firstEmpty !== -1) return firstEmpty;
  return slots.length;
}

export function ensureOutputSlotIndex(
  slots: Array<string | null>,
  statuses: OutputSlotStatus[],
  errors: Array<string | null>,
  slot: number,
): void {
  while (slots.length <= slot) slots.push(null);
  while (statuses.length <= slot) statuses.push("idle");
  while (errors.length <= slot) errors.push(null);
}
