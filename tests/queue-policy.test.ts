import { describe, it, expect } from "vitest";
import { pickAccount, type AccountLoad } from "@/lib/queue-policy";

describe("pickAccount", () => {
  const accounts: AccountLoad[] = [
    { id: "a", maxConcurrent: 2, inFlight: 2 }, // full
    { id: "b", maxConcurrent: 3, inFlight: 1 }, // 2 free
    { id: "c", maxConcurrent: 3, inFlight: 2 }, // 1 free
  ];

  it("returns the account with the most free capacity", () => {
    expect(pickAccount(accounts)?.id).toBe("b");
  });

  it("returns null when every account is at capacity", () => {
    expect(pickAccount([{ id: "a", maxConcurrent: 1, inFlight: 1 }])).toBeNull();
  });

  it("ignores accounts with no free slots and picks among the rest", () => {
    expect(
      pickAccount([
        { id: "a", maxConcurrent: 1, inFlight: 1 },
        { id: "c", maxConcurrent: 3, inFlight: 2 },
      ])?.id,
    ).toBe("c");
  });

  it("returns null for an empty list", () => {
    expect(pickAccount([])).toBeNull();
  });
});
