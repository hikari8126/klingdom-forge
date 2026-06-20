# KlingDom Forge — Milestone 2b: Workspaces & Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Super Admins create workspaces and assign members, let managers/members work inside workspaces, and organize work into projects — all access-bounded by workspace membership.

**Architecture:** New Prisma models (`Workspace`, `WorkspaceMember`, `Project`) plus a `WorkspaceRole` enum. Authorization lives in pure, unit-tested predicates in `src/lib/access.ts` (no I/O). Thin data/service functions in `src/lib/workspaces.ts` and `src/lib/projects.ts` enforce those predicates with `requireUser()` and the Prisma `db`. Server Components + Server Actions render and mutate; the UI reuses the M1 glass kit.

**Tech Stack:** Next.js 14 App Router (Server Components + Server Actions), Prisma 5 + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md` (§4 data model, §7 roles)

**Builds on:** M1 + M2a (on `main`). Reuses `db` (`src/lib/db.ts`), `requireUser`/`getCurrentUser`/`CurrentUser` (`src/lib/session.ts`), the `Role` enum, and `Card`/`PageHeader`/`Button` (`src/components/ui.tsx`).

## Access rules (the authorization contract this milestone enforces)
- **Create workspace:** `super_admin` only.
- **View/enter a workspace:** `super_admin` (all workspaces) OR a user with a `WorkspaceMember` row for it.
- **Manage a workspace** (add/remove members, set member role, edit name/limits): `super_admin` OR the workspace's `manager`.
- **Create a project** in a workspace: `super_admin` OR any member of that workspace (manager or member). *(Members can create projects by default — a deliberate spec decision.)*
- **Delete a project:** `super_admin` OR the workspace `manager`.
- Super Admin has implicit access to every workspace without a membership row.

---

## File Structure (this milestone)

```
prisma/schema.prisma                       # MODIFY — add Workspace/WorkspaceMember/Project + WorkspaceRole enum + User relations
src/lib/
├── access.ts                              # CREATE — pure predicates (TDD)
├── workspaces.ts                          # CREATE — workspace data/service fns (enforce access)
└── projects.ts                            # CREATE — project data/service fns (enforce access)
src/app/
├── workspaces/
│   ├── page.tsx                           # CREATE — list my workspaces + create form (super_admin)
│   ├── actions.ts                         # CREATE — server actions: createWorkspace, addMember, removeMember
│   └── [workspaceId]/
│       ├── page.tsx                       # CREATE — workspace detail: projects + members
│       └── projects/actions.ts            # CREATE — server actions: createProject, deleteProject
└── page.tsx                               # MODIFY — add a link to /workspaces
tests/
├── access.test.ts                         # CREATE — unit tests for predicates
src/components/ui.tsx                       # MODIFY — add TextInput + Select (small additions to the kit)
```

Responsibilities: `access.ts` = rules (pure, tested). `workspaces.ts`/`projects.ts` = the only place that talks to Prisma for these entities, each function calling a predicate before mutating. `actions.ts` files = thin Server Action wrappers (`"use server"`) that call the service fns and `revalidatePath`. Pages = Server Components that read via the service fns.

---

## Task 1: Schema — Workspace, WorkspaceMember, Project

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Append the enum + models and add relations to `User`**

Add this `WorkspaceRole` enum and the three models (keep existing `Role` enum, `User`, generator, datasource):

```prisma
enum WorkspaceRole {
  manager
  member
}

model Workspace {
  id          String            @id @default(cuid())
  name        String
  maxInFlight Int               @default(3)
  dailyQuota  Int?
  createdById String
  createdBy   User              @relation("WorkspaceCreatedBy", fields: [createdById], references: [id])
  createdAt   DateTime          @default(now())
  members     WorkspaceMember[]
  projects    Project[]
}

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(member)
  createdAt   DateTime      @default(now())
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
}

model Project {
  id          String    @id @default(cuid())
  workspaceId String
  name        String
  createdById String
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy   User      @relation("ProjectCreatedBy", fields: [createdById], references: [id])
}
```

Then update the existing `User` model to add the inverse relations (add these three lines before the closing brace; keep all existing fields):

```prisma
  memberships       WorkspaceMember[]
  createdWorkspaces Workspace[]       @relation("WorkspaceCreatedBy")
  createdProjects   Project[]         @relation("ProjectCreatedBy")
```

- [ ] **Step 2: Create + apply the migration**

Run (DB up): `npx prisma migrate dev --name workspaces_projects`
Expected: new migration creating `WorkspaceRole` enum + `Workspace`, `WorkspaceMember`, `Project` tables with the unique index on (workspaceId, userId); "in sync"; client regenerated.

- [ ] **Step 3: Verify tables**

Run: `docker exec klingdom-forge-db psql -U forge -d klingdom_forge -c '\dt'`
Expected: `Workspace`, `WorkspaceMember`, `Project` listed alongside `User`, `_prisma_migrations`.

- [ ] **Step 4: Confirm existing tests pass**

Run: `npm test` → Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): Workspace, WorkspaceMember, Project models + relations"
```

---

## Task 2: Access-policy predicates (TDD)

**Files:**
- Test: `tests/access.test.ts`
- Create: `src/lib/access.ts`

- [ ] **Step 1: Write the failing test `tests/access.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  canCreateWorkspace,
  canAccessWorkspace,
  canManageWorkspace,
  canCreateProject,
  canDeleteProject,
} from "@/lib/access";

// Membership is the actor's WorkspaceMember row for the workspace, or null.
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` → Expected: FAIL — cannot resolve `@/lib/access`.

- [ ] **Step 3: Write `src/lib/access.ts`**

```ts
import type { Role, WorkspaceRole } from "@prisma/client";

/** The actor's membership in a given workspace, or null if they have none. */
export type Membership = { role: WorkspaceRole } | null;

export function canCreateWorkspace(role: Role): boolean {
  return role === "super_admin";
}

export function canAccessWorkspace(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership !== null;
}

export function canManageWorkspace(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership?.role === "manager";
}

export function canCreateProject(role: Role, membership: Membership): boolean {
  // Any member of the workspace (manager or member) may create projects.
  return role === "super_admin" || membership !== null;
}

export function canDeleteProject(role: Role, membership: Membership): boolean {
  return role === "super_admin" || membership?.role === "manager";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` → Expected: PASS — access tests + prior tests all green.

- [ ] **Step 5: Commit**

```bash
git add tests/access.test.ts src/lib/access.ts
git commit -m "feat(access): workspace/project authorization predicates (TDD)"
```

---

## Task 3: Workspace service functions

**Files:**
- Create: `src/lib/workspaces.ts`

- [ ] **Step 1: Create `src/lib/workspaces.ts`**

```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import {
  canAccessWorkspace,
  canCreateWorkspace,
  canManageWorkspace,
  type Membership,
} from "@/lib/access";
import type { WorkspaceRole } from "@prisma/client";

/** Thrown when an actor lacks permission for an operation. */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The actor's membership row for a workspace (role only), or null. */
async function membershipFor(
  workspaceId: string,
  userId: string,
): Promise<Membership> {
  const m = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m;
}

/** Workspaces the actor can see: all for super_admin, else those they belong to. */
export async function listWorkspacesForUser(actor: CurrentUser) {
  if (actor.role === "super_admin") {
    return db.workspace.findMany({ orderBy: { createdAt: "desc" } });
  }
  return db.workspace.findMany({
    where: { members: { some: { userId: actor.id } } },
    orderBy: { createdAt: "desc" },
  });
}

/** super_admin only. Creates a workspace. */
export async function createWorkspace(actor: CurrentUser, name: string) {
  if (!canCreateWorkspace(actor.role)) throw new ForbiddenError();
  const clean = name.trim();
  if (!clean) throw new Error("Workspace name is required");
  return db.workspace.create({
    data: { name: clean, createdById: actor.id },
  });
}

/** Returns the workspace with members+projects if the actor may access it, else null. */
export async function getWorkspaceForUser(actor: CurrentUser, workspaceId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { include: { user: true }, orderBy: { createdAt: "asc" } },
      projects: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!workspace) return null;
  const membership: Membership =
    workspace.members.find((m) => m.userId === actor.id) ?? null;
  if (!canAccessWorkspace(actor.role, membership)) return null;
  return { workspace, membership };
}

/** Adds (or updates the role of) a member by email. super_admin or workspace manager only. */
export async function addMember(
  actor: CurrentUser,
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canManageWorkspace(actor.role, membership)) throw new ForbiddenError();
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error("No user with that email has signed in yet");
  return db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    create: { workspaceId, userId: user.id, role },
    update: { role },
  });
}

/** Removes a member. super_admin or workspace manager only. */
export async function removeMember(
  actor: CurrentUser,
  workspaceId: string,
  userId: string,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canManageWorkspace(actor.role, membership)) throw new ForbiddenError();
  await db.workspaceMember.deleteMany({ where: { workspaceId, userId } });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` → Expected: compiles with no type errors. (Confirms the Prisma composite-key arg name `workspaceId_userId` and relation includes are correct against the generated client.)

- [ ] **Step 3: Confirm tests still pass**

Run: `npm test` → Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/workspaces.ts
git commit -m "feat(workspaces): service fns (list/create/get/addMember/removeMember) with access checks"
```

---

## Task 4: Project service functions

**Files:**
- Create: `src/lib/projects.ts`

- [ ] **Step 1: Create `src/lib/projects.ts`**

```ts
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import {
  canCreateProject,
  canDeleteProject,
  type Membership,
} from "@/lib/access";
import { ForbiddenError } from "@/lib/workspaces";

async function membershipFor(
  workspaceId: string,
  userId: string,
): Promise<Membership> {
  const m = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m;
}

/** Creates a project in a workspace. super_admin or any member of the workspace. */
export async function createProject(
  actor: CurrentUser,
  workspaceId: string,
  name: string,
) {
  const membership = await membershipFor(workspaceId, actor.id);
  if (!canCreateProject(actor.role, membership)) throw new ForbiddenError();
  const clean = name.trim();
  if (!clean) throw new Error("Project name is required");
  return db.project.create({
    data: { name: clean, workspaceId, createdById: actor.id },
  });
}

/** Deletes a project. super_admin or the workspace manager. */
export async function deleteProject(actor: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  const membership = await membershipFor(project.workspaceId, actor.id);
  if (!canDeleteProject(actor.role, membership)) throw new ForbiddenError();
  await db.project.delete({ where: { id: projectId } });
}
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build` → Expected: compiles clean.
Run: `npm test` → Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/projects.ts
git commit -m "feat(projects): create/delete service fns with access checks"
```

---

## Task 5: UI kit additions (TextInput, Select)

**Files:**
- Modify: `src/components/ui.tsx`

- [ ] **Step 1: Append `TextInput` and `Select` to `src/components/ui.tsx`**

Add these two exports (keep existing `Card`/`PageHeader`/`Button`):

```tsx
export function TextInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`glass-input rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`glass-input rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build` → Expected: compiles clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui.tsx
git commit -m "feat(ui): TextInput and Select glass form controls"
```

---

## Task 6: Workspaces list page + create + server actions

**Files:**
- Create: `src/app/workspaces/actions.ts`
- Create: `src/app/workspaces/page.tsx`
- Modify: `src/app/page.tsx` (add a link to /workspaces)

- [ ] **Step 1: Create `src/app/workspaces/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceRole } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { createWorkspace, addMember, removeMember } from "@/lib/workspaces";

export async function createWorkspaceAction(formData: FormData) {
  const actor = await requireUser();
  const name = String(formData.get("name") ?? "");
  await createWorkspace(actor, name);
  revalidatePath("/workspaces");
}

export async function addMemberAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "member") as WorkspaceRole;
  await addMember(actor, workspaceId, email, role);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function removeMemberAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  await removeMember(actor, workspaceId, userId);
  revalidatePath(`/workspaces/${workspaceId}`);
}
```

- [ ] **Step 2: Create `src/app/workspaces/page.tsx`**

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listWorkspacesForUser } from "@/lib/workspaces";
import { canCreateWorkspace } from "@/lib/access";
import { Card, PageHeader, Button, TextInput } from "@/components/ui";
import { createWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesForUser(user);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Workspaces" subtitle="Không gian làm việc của bạn" />

      {canCreateWorkspace(user.role) && (
        <Card className="mt-8">
          <form action={createWorkspaceAction} className="flex gap-2">
            <TextInput
              name="name"
              placeholder="Tên workspace mới"
              required
              className="flex-1"
            />
            <Button type="submit">Tạo</Button>
          </form>
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {workspaces.length === 0 && (
          <Card>
            <p className="text-muted">Chưa có workspace nào.</p>
          </Card>
        )}
        {workspaces.map((w) => (
          <Link key={w.id} href={`/workspaces/${w.id}`} className="block">
            <Card className="transition hover:bg-white/5">
              <span className="text-white">{w.name}</span>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add a link to `/workspaces` in `src/app/page.tsx`**

In `src/app/page.tsx`, add this import at the top with the other imports:

```tsx
import Link from "next/link";
```

Then, immediately after the closing `</Card>` of the Database card (just before the closing `</main>`), add:

```tsx
      <Link href="/workspaces" className="mt-4 inline-block">
        <Button>Vào Workspaces →</Button>
      </Link>
```

- [ ] **Step 4: Verify build + tests**

Run: `npm test` → Expected: all tests pass.
Run: `npm run build` → Expected: compiles clean; route `/workspaces` present.

- [ ] **Step 5: Commit**

```bash
git add src/app/workspaces/actions.ts src/app/workspaces/page.tsx src/app/page.tsx
git commit -m "feat(workspaces): list page, create form, link from landing"
```

---

## Task 7: Workspace detail page (members + projects) + project actions

**Files:**
- Create: `src/app/workspaces/[workspaceId]/projects/actions.ts`
- Create: `src/app/workspaces/[workspaceId]/page.tsx`

- [ ] **Step 1: Create `src/app/workspaces/[workspaceId]/projects/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createProject, deleteProject } from "@/lib/projects";

export async function createProjectAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const name = String(formData.get("name") ?? "");
  await createProject(actor, workspaceId, name);
  revalidatePath(`/workspaces/${workspaceId}`);
}

export async function deleteProjectAction(formData: FormData) {
  const actor = await requireUser();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  await deleteProject(actor, projectId);
  revalidatePath(`/workspaces/${workspaceId}`);
}
```

- [ ] **Step 2: Create `src/app/workspaces/[workspaceId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspaces";
import { canManageWorkspace, canCreateProject } from "@/lib/access";
import { Card, PageHeader, Button, TextInput, Select } from "@/components/ui";
import {
  createProjectAction,
  deleteProjectAction,
} from "./projects/actions";
import { addMemberAction, removeMemberAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const user = await requireUser();
  const result = await getWorkspaceForUser(user, params.workspaceId);
  if (!result) notFound();
  const { workspace, membership } = result;
  const canManage = canManageWorkspace(user.role, membership);
  const canAddProject = canCreateProject(user.role, membership);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title={workspace.name} subtitle="Workspace" />

      {/* Projects */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-white">Projects</h2>
        {canAddProject && (
          <Card className="mb-3">
            <form action={createProjectAction} className="flex gap-2">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <TextInput
                name="name"
                placeholder="Tên project mới"
                required
                className="flex-1"
              />
              <Button type="submit">Tạo project</Button>
            </form>
          </Card>
        )}
        <div className="space-y-2">
          {workspace.projects.length === 0 && (
            <Card>
              <p className="text-muted">Chưa có project nào.</p>
            </Card>
          )}
          {workspace.projects.map((p) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <span className="text-white">{p.name}</span>
                {canManage && (
                  <form action={deleteProjectAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="projectId" value={p.id} />
                    <Button variant="ghost" type="submit">
                      Xoá
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Members */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium text-white">Thành viên</h2>
        {canManage && (
          <Card className="mb-3">
            <form action={addMemberAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <TextInput
                name="email"
                type="email"
                placeholder="email@crossian.com"
                required
                className="flex-1"
              />
              <Select name="role" defaultValue="member">
                <option value="member">member</option>
                <option value="manager">manager</option>
              </Select>
              <Button type="submit">Thêm</Button>
            </form>
          </Card>
        )}
        <div className="space-y-2">
          {workspace.members.map((m) => (
            <Card key={m.id}>
              <div className="flex items-center justify-between">
                <span className="text-white">
                  {m.user.name ?? m.user.email}{" "}
                  <span className="text-accent-soft">({m.role})</span>
                </span>
                {canManage && (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <Button variant="ghost" type="submit">
                      Gỡ
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          ))}
          {workspace.members.length === 0 && (
            <Card>
              <p className="text-muted">Chưa có thành viên nào được thêm.</p>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Verify build + tests**

Run: `npm test` → Expected: all tests pass.
Run: `npm run build` → Expected: compiles clean; route `/workspaces/[workspaceId]` present.

- [ ] **Step 4: Runtime smoke test (no Google creds needed — uses a seeded session-free check of routing)**

Because logging in requires Google creds, do a lightweight runtime check that the routes compile and redirect when unauthenticated:
1. `npm run db:up` (ensure DB), start dev in background: `(npm run dev > /tmp/kdf-m2b.log 2>&1 &)`, `sleep 9`.
2. `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/workspaces` → expect `307`/`302` (redirect to /login since unauthenticated).
3. `tail -30 /tmp/kdf-m2b.log` → confirm NO server errors (no Prisma/edge crash, no unhandled exception).
4. Kill the dev server (`lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill`) and confirm port 3000 free.

- [ ] **Step 5: Commit**

```bash
git add "src/app/workspaces/[workspaceId]/page.tsx" "src/app/workspaces/[workspaceId]/projects/actions.ts"
git commit -m "feat(workspaces): detail page with projects + member management"
```

---

## Done criteria for Milestone 2b

- New tables `Workspace`, `WorkspaceMember`, `Project` exist (migration committed).
- Authorization predicates unit-tested (`tests/access.test.ts`) and all tests pass.
- Service functions enforce the access rules (only the predicate decides; pages/actions can't bypass).
- `/workspaces` lists the user's workspaces (all, for super_admin); super_admin sees a create form.
- `/workspaces/[id]` shows projects + members; managers/super_admin can add/remove members and delete projects; any member can create projects.
- `npm test` passes; `npm run build` compiles clean; unauthenticated access to `/workspaces` redirects to `/login`.

This hands later milestones (M3 Kling client, M4 queue) a real workspace/project structure to attach batches and jobs to, with membership-based access already enforced.
