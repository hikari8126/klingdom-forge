import { describe, it, expect } from "vitest";
import { getHealth } from "@/lib/health";

describe("getHealth", () => {
  it("returns ok when the db query succeeds", async () => {
    const fakeDb = { $queryRaw: async () => [{ "?column?": 1 }] };
    const result = await getHealth(fakeDb);
    expect(result).toEqual({ status: "ok", db: true });
  });

  it("returns error when the db query throws", async () => {
    const fakeDb = {
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    };
    const result = await getHealth(fakeDb);
    expect(result.status).toBe("error");
    expect(result.db).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});
