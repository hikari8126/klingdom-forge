export type AccountLoad = {
  id: string;
  maxConcurrent: number;
  inFlight: number;
};

/** Pick the enabled account with the most free capacity, or null if none free. */
export function pickAccount(accounts: AccountLoad[]): AccountLoad | null {
  let best: AccountLoad | null = null;
  let bestFree = 0;
  for (const a of accounts) {
    const free = a.maxConcurrent - a.inFlight;
    if (free > bestFree) {
      bestFree = free;
      best = a;
    }
  }
  return best;
}
