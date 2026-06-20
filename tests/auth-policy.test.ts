import { describe, it, expect } from "vitest";
import { isAllowedEmail, resolveRole } from "@/lib/auth-policy";

describe("isAllowedEmail", () => {
  it("accepts an email in the allowed domain (case-insensitive)", () => {
    expect(isAllowedEmail("a.b@crossian.com", "crossian.com")).toBe(true);
    expect(isAllowedEmail("A.B@Crossian.COM", "crossian.com")).toBe(true);
  });

  it("rejects a different domain", () => {
    expect(isAllowedEmail("someone@gmail.com", "crossian.com")).toBe(false);
  });

  it("rejects a look-alike subdomain or suffix trick", () => {
    expect(isAllowedEmail("evil@notcrossian.com", "crossian.com")).toBe(false);
    expect(isAllowedEmail("evil@crossian.com.attacker.com", "crossian.com")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isAllowedEmail("no-at-sign", "crossian.com")).toBe(false);
    expect(isAllowedEmail("", "crossian.com")).toBe(false);
  });
});

describe("resolveRole", () => {
  const admins = ["hoang.vietnguyen@crossian.com"];

  it("grants super_admin to an allowlisted email (case-insensitive)", () => {
    expect(resolveRole("hoang.vietnguyen@crossian.com", admins, null)).toBe("super_admin");
    expect(resolveRole("HOANG.VietNguyen@crossian.com", admins, null)).toBe("super_admin");
  });

  it("defaults a brand-new non-admin user to member", () => {
    expect(resolveRole("new.person@crossian.com", admins, null)).toBe("member");
  });

  it("preserves an existing non-admin role on subsequent logins", () => {
    expect(resolveRole("lead@crossian.com", admins, "manager")).toBe("manager");
  });

  it("super_admin allowlist overrides any existing role", () => {
    expect(resolveRole("hoang.vietnguyen@crossian.com", admins, "member")).toBe("super_admin");
  });
});
