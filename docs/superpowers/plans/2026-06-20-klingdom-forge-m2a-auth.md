# KlingDom Forge — Milestone 2a: Authentication (Google SSO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add domain-restricted Google Workspace sign-in to KlingDom Forge, bootstrap a global role on first login, protect the app behind auth, and expose typed current-user helpers for everything built later.

**Architecture:** Auth.js (NextAuth v5) with the Google provider and a JWT cookie session (no DB session tables). A `signIn` callback rejects emails outside the allowed Workspace domain; a `jwt` callback upserts the user into our own `User` table and resolves their global role (super_admin if their email is in an env allowlist, else member). Pure, framework-agnostic policy helpers (`isAllowedEmail`, `resolveRole`) hold the testable logic and are unit-tested with Vitest; the NextAuth wiring, middleware, and login UI are verified by a clean build plus a documented manual OAuth smoke test.

**Tech Stack:** next-auth@beta (v5), Next.js 14 App Router, Prisma 5 + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md` (§7 Auth & roles)

**Builds on:** M1 foundation (branch merged/stacked). Reuses `src/lib/db.ts` (Prisma `db` singleton), the `User` model + `Role` enum, and the `Card`/`PageHeader`/`Button` UI kit.

---

## Prerequisite (human action — needed only for the manual OAuth smoke test, NOT for building/committing)

The implementer does NOT need real Google credentials to complete this plan — unit tests + `npm run build` are the automated gates. To actually log in, the user must, in Google Cloud Console:
1. Create an **OAuth 2.0 Client ID** (Application type: Web application).
2. Add Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`.
3. Put the values in `.env` (NOT committed):
   ```
   AUTH_SECRET="<output of: npx auth secret>"
   AUTH_GOOGLE_ID="<client id>"
   AUTH_GOOGLE_SECRET="<client secret>"
   ALLOWED_EMAIL_DOMAIN="crossian.com"
   SUPER_ADMIN_EMAILS="hoang.vietnguyen@crossian.com"
   ```
`.env.example` (committed) documents these keys with empty/placeholder values.

---

## File Structure (this milestone)

```
src/
├── lib/
│   ├── auth-policy.ts        # CREATE — pure: isAllowedEmail(), resolveRole()  (TDD)
│   └── session.ts            # CREATE — getCurrentUser() / requireUser()
├── auth.ts                   # CREATE — NextAuth v5 config (providers, callbacks)
├── middleware.ts             # CREATE — redirect unauthenticated users to /login
├── types/
│   └── next-auth.d.ts        # CREATE — augment Session/JWT with id + role
└── app/
    ├── api/auth/[...nextauth]/route.ts  # CREATE — export { GET, POST } = handlers
    ├── login/page.tsx        # CREATE — "Sign in with Google" page
    └── page.tsx              # MODIFY — greet current user + sign-out
tests/
└── auth-policy.test.ts       # CREATE — unit tests for the two pure helpers
prisma/schema.prisma          # MODIFY — User: drop passwordHash, add name/image
.env.example                  # MODIFY — add the AUTH_* / ALLOWED_* / SUPER_ADMIN_* keys
package.json                  # MODIFY — add next-auth@beta dependency (via npm install)
```

Responsibilities: `auth-policy.ts` = pure rules (no I/O, fully unit-tested). `auth.ts` = NextAuth wiring that *uses* those rules + Prisma upsert. `session.ts` = read-side helpers for pages/actions. `middleware.ts` = route gate. The data shape (`User` without password) is locked in Task 1.

---

## Task 1: Evolve the User model for OAuth

**Files:**
- Modify: `prisma/schema.prisma` (the `User` model)

- [ ] **Step 1: Update the `User` model in `prisma/schema.prisma`**

Replace the existing `User` model with this (the `Role` enum and the generator/datasource blocks stay unchanged):

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  role      Role     @default(member)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

(This removes `passwordHash` — we authenticate via Google, no passwords — and adds nullable `name` and `image` populated from the Google profile.)

- [ ] **Step 2: Create and apply the migration**

Run (DB must be up — `npm run db:up` if needed): `npx prisma migrate dev --name user_oauth_fields`
Expected: a new migration under `prisma/migrations/<ts>_user_oauth_fields/` whose SQL drops the `passwordHash` column and adds `name` + `image`; prints "Your database is now in sync with your schema." and regenerates the client.

- [ ] **Step 3: Verify the column change**

Run: `docker exec klingdom-forge-db psql -U forge -d klingdom_forge -c '\d "User"'`
Expected: columns `id, email, name, image, role, createdAt, updatedAt`; NO `passwordHash`.

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test`
Expected: the M1 health tests still pass (2 passed).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): User model for OAuth (drop passwordHash, add name/image)"
```

---

## Task 2: Pure auth-policy helpers (TDD)

**Files:**
- Test: `tests/auth-policy.test.ts`
- Create: `src/lib/auth-policy.ts`

- [ ] **Step 1: Write the failing test `tests/auth-policy.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/auth-policy`.

- [ ] **Step 3: Write `src/lib/auth-policy.ts`**

```ts
import type { Role } from "@prisma/client";

/** True iff `email`'s domain part exactly equals `allowedDomain` (case-insensitive). */
export function isAllowedEmail(email: string, allowedDomain: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return domain === allowedDomain.trim().toLowerCase();
}

/**
 * Resolve a user's GLOBAL role at login time.
 * - Email in the super-admin allowlist → "super_admin" (always wins).
 * - Otherwise keep their existing role, or default a new user to "member".
 */
export function resolveRole(
  email: string,
  superAdminEmails: string[],
  existingRole: Role | null,
): Role {
  const normalized = email.trim().toLowerCase();
  const isAdmin = superAdminEmails.some((e) => e.trim().toLowerCase() === normalized);
  if (isAdmin) return "super_admin";
  return existingRole ?? "member";
}
```

(The `Role` import is type-only and erased at runtime, so the test needs no generated Prisma client. The returned string literals are assignable to the `Role` type.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — auth-policy tests + the existing health tests all green.

- [ ] **Step 5: Commit**

```bash
git add tests/auth-policy.test.ts src/lib/auth-policy.ts
git commit -m "feat(auth): domain + role policy helpers (TDD)"
```

---

## Task 3: NextAuth v5 config + route handler + env

**Files:**
- Install: `next-auth@beta`
- Create: `src/auth.ts`
- Create: `src/types/next-auth.d.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install Auth.js v5**

Run: `npm install next-auth@beta`
Expected: `next-auth` (v5.x beta) added to `package.json` dependencies; install succeeds.

- [ ] **Step 2: Augment NextAuth types in `src/types/next-auth.d.ts`**

```ts
import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
  }
}
```

- [ ] **Step 3: Create `src/auth.ts`**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { isAllowedEmail, resolveRole } from "@/lib/auth-policy";

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? "crossian.com";
const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    // Gate: only verified emails in the allowed Workspace domain may sign in.
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email) return false;
      if (profile?.email_verified === false) return false;
      return isAllowedEmail(email, allowedDomain);
    },
    // On sign-in (profile present), upsert the user and resolve their global role.
    async jwt({ token, profile }) {
      if (profile?.email) {
        const email = profile.email.toLowerCase();
        const existing = await db.user.findUnique({ where: { email } });
        const role = resolveRole(email, superAdminEmails, existing?.role ?? null);
        const name = (profile.name as string | undefined) ?? null;
        const image = (profile.picture as string | undefined) ?? null;
        const user = await db.user.upsert({
          where: { email },
          create: { email, name, image, role },
          update: { name, image, role },
        });
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId ?? "";
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
});
```

(Auth.js v5 auto-reads `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` from the environment — no need to pass clientId/secret explicitly.)

- [ ] **Step 4: Create the route handler `src/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Add the auth keys to `.env.example`**

Append these lines to `.env.example`:

```
# Auth.js / Google Workspace SSO
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
ALLOWED_EMAIL_DOMAIN="crossian.com"
SUPER_ADMIN_EMAILS="hoang.vietnguyen@crossian.com"
```

- [ ] **Step 6: Verify it compiles and tests still pass**

Run: `npm test` → Expected: all tests pass (unchanged).
Run: `npm run build` → Expected: compiles with NO type errors. The new `/api/auth/[...nextauth]` route appears in the route list. (Build does not require real secrets.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/auth.ts src/types/next-auth.d.ts src/app/api/auth/[...nextauth]/route.ts .env.example
git commit -m "feat(auth): NextAuth v5 Google provider with domain gate + role upsert"
```

---

## Task 4: Current-user session helpers

**Files:**
- Create: `src/lib/session.ts`

- [ ] **Step 1: Create `src/lib/session.ts`**

```ts
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
};

/** Returns the signed-in user, or null if there is no valid session. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: session.user.role,
  };
}

/** Returns the signed-in user or redirects to /login. Use in protected pages/actions. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: compiles with no type errors (this confirms `session.user.role`/`.id` resolve against the Task 3 type augmentation).

- [ ] **Step 3: Commit**

```bash
git add src/lib/session.ts
git commit -m "feat(auth): getCurrentUser/requireUser session helpers"
```

---

## Task 5: Login page, route protection, and signed-in landing page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/middleware.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the login page `src/app/login/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { Card, PageHeader, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        <PageHeader
          title="KlingDom Forge"
          subtitle="Đăng nhập bằng tài khoản Google công ty"
        />
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Đăng nhập với Google
          </Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create `src/middleware.ts` to gate the app**

```ts
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");
  if (!req.auth && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 3: Update `src/app/page.tsx` to require auth and greet the user**

```tsx
import { db } from "@/lib/db";
import { getHealth } from "@/lib/health";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";
import { Card, PageHeader, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();
  const health = await getHealth(db);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between">
        <PageHeader title="KlingDom Forge" subtitle="AI video generation studio" />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button variant="ghost" type="submit">
            Đăng xuất
          </Button>
        </form>
      </div>

      <Card className="mt-8">
        <div className="flex items-center justify-between">
          <span className="text-muted">Đăng nhập</span>
          <span className="text-white">
            {user.name ?? user.email}{" "}
            <span className="text-accent-soft">({user.role})</span>
          </span>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-muted">Database</span>
          <span className={health.db ? "text-ok" : "text-bad"}>
            {health.db ? "● connected" : "● offline"}
          </span>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Verify build + tests**

Run: `npm test` → Expected: all tests pass.
Run: `npm run build` → Expected: compiles clean; routes `/`, `/login`, `/api/auth/[...nextauth]` present; middleware compiles.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/middleware.ts src/app/page.tsx
git commit -m "feat(auth): login page, route-protection middleware, signed-in landing"
```

- [ ] **Step 6: Manual OAuth smoke test (requires the human prerequisite above)**

This step is the end-to-end verification; it needs real Google credentials in `.env`. If credentials are not yet present, report this step as DEFERRED-TO-USER (do NOT block the milestone on it — the automated gates in Steps 4 are the completion criteria).

With `.env` populated and `npm run db:up` running:
1. `npm run dev`, open `http://localhost:3000` → should redirect to `/login`.
2. Click "Đăng nhập với Google", complete Google login with a `@crossian.com` account → lands on `/` showing your name + role.
3. The super-admin allowlisted email shows role `super_admin`; a different `@crossian.com` user shows `member`.
4. Attempt with a non-`@crossian.com` Google account → access denied (not signed in).
5. Click "Đăng xuất" → back to `/login`.
6. Kill the dev server and free port 3000 afterward.

---

## Done criteria for Milestone 2a

- `User` table has no password column; has `name`/`image`; migration committed.
- `npm test` passes (health + auth-policy unit tests).
- `npm run build` compiles cleanly with the NextAuth wiring, middleware, login page.
- Unauthenticated requests to app routes redirect to `/login`; `/login` and `/api/auth/*` are public.
- On login, users are upserted and assigned a global role (super_admin via env allowlist, else member); non-`@crossian.com` emails are rejected.
- `getCurrentUser()` / `requireUser()` are available for M2b and later milestones.

This hands Milestone 2b (Workspace/Project CRUD) a working identity layer: every server action/page can call `requireUser()` and branch on `user.role`.
