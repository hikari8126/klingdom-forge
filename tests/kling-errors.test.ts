import { describe, it, expect } from "vitest";
import { classifyKlingError, KlingError } from "@/lib/kling";

const ke = (code?: number) => new KlingError("x", code);

describe("classifyKlingError", () => {
  it("auth + abnormal-account codes → account (disable + requeue)", () => {
    for (const c of [1000, 1001, 1002, 1004, 1100]) {
      expect(classifyKlingError(ke(c))).toBe("account");
    }
  });
  it("token-not-yet-valid / rate / concurrency / server → retry", () => {
    for (const c of [1003, 1302, 1303, 5000, 5001, 5002]) {
      expect(classifyKlingError(ke(c))).toBe("retry");
    }
  });
  it("out-of-balance / bad params / content policy / no model access / IP whitelist → fatal", () => {
    for (const c of [1101, 1102, 1103, 1200, 1201, 1202, 1203, 1300, 1301, 1304]) {
      expect(classifyKlingError(ke(c))).toBe("fatal");
    }
  });
  it("unknown Kling code → fatal (surface it)", () => {
    expect(classifyKlingError(ke(9999))).toBe("fatal");
  });
  it("network / non-KlingError → retry", () => {
    expect(classifyKlingError(new Error("fetch failed"))).toBe("retry");
    expect(classifyKlingError(ke(undefined))).toBe("retry");
  });
});
