import { describe, it, expect } from "vitest";
import {
  canCreateWorkspace,
  canAccessWorkspace,
  canManageWorkspace,
  canCreateProject,
  canDeleteProject,
} from "@/lib/access";

const noMembership = null;
const asMember = { role: "member" as const };
const asManager = { role: "manager" as const };

describe("canCreateWorkspace", () => {
  it("only super_admin can create workspaces", () => {
    expect(canCreateWorkspace("super_admin")).toBe(true);
    expect(canCreateWorkspace("manager")).toBe(false);
    expect(canCreateWorkspace("member")).toBe(false);
  });
});

describe("canAccessWorkspace", () => {
  it("super_admin can access any workspace without membership", () => {
    expect(canAccessWorkspace("super_admin", noMembership)).toBe(true);
  });
  it("a member or manager with a membership can access", () => {
    expect(canAccessWorkspace("member", asMember)).toBe(true);
    expect(canAccessWorkspace("member", asManager)).toBe(true);
  });
  it("a non-super_admin without membership cannot access", () => {
    expect(canAccessWorkspace("member", noMembership)).toBe(false);
    expect(canAccessWorkspace("manager", noMembership)).toBe(false);
  });
});

describe("canManageWorkspace", () => {
  it("super_admin can manage any workspace", () => {
    expect(canManageWorkspace("super_admin", noMembership)).toBe(true);
  });
  it("only the workspace manager can manage (not a plain member)", () => {
    expect(canManageWorkspace("member", asManager)).toBe(true);
    expect(canManageWorkspace("member", asMember)).toBe(false);
    expect(canManageWorkspace("member", noMembership)).toBe(false);
  });
});

describe("canCreateProject", () => {
  it("super_admin or any member of the workspace can create projects", () => {
    expect(canCreateProject("super_admin", noMembership)).toBe(true);
    expect(canCreateProject("member", asMember)).toBe(true);
    expect(canCreateProject("member", asManager)).toBe(true);
  });
  it("a non-member (non-super_admin) cannot create projects", () => {
    expect(canCreateProject("member", noMembership)).toBe(false);
  });
});

describe("canDeleteProject", () => {
  it("super_admin or the workspace manager can delete projects", () => {
    expect(canDeleteProject("super_admin", noMembership)).toBe(true);
    expect(canDeleteProject("member", asManager)).toBe(true);
  });
  it("a plain member cannot delete projects", () => {
    expect(canDeleteProject("member", asMember)).toBe(false);
  });
});
