# KlingDom Forge — Milestone 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable Next.js 14 app with the EngZone visual language, a local Postgres database wired through Prisma, and a health check that proves the full stack works end-to-end.

**Architecture:** Single repo. Next.js 14 App Router (TypeScript) serves UI + API. Prisma talks to a local Postgres (via Docker Compose). A `getHealth(db)` helper is unit-tested in isolation and consumed by both a `/api/health` route and the landing page so a DB-connectivity badge renders on load.

**Tech Stack:** Next.js 14.2.35, React 18.3.1, TypeScript 5.7, Tailwind CSS 3.4, Prisma 5 + PostgreSQL 16, Vitest 2 for unit tests, Docker Compose for local DB.

**Spec:** `docs/superpowers/specs/2026-06-20-klingdom-forge-design.md`

---

## File Structure (created in this milestone)

```
klingdom-forge/
├── package.json                  # scripts + deps
├── next.config.mjs               # Next config
├── tsconfig.json                 # TS config + @/* alias
├── postcss.config.mjs            # Tailwind/Autoprefixer
├── tailwind.config.ts            # EngZone color tokens + glow shadow
├── vitest.config.ts              # test runner + @/* alias
├── docker-compose.yml            # local Postgres 16
├── .env.example                  # DATABASE_URL template (committed)
├── .env                          # real values (gitignored)
├── prisma/
│   └── schema.prisma             # datasource + Role enum + User model
└── src/
    ├── lib/
    │   ├── db.ts                 # Prisma client singleton
    │   └── health.ts             # getHealth(db) — testable
    ├── components/
    │   └── ui.tsx                # Card / Button / PageHeader (glass)
    └── app/
        ├── globals.css           # tokens + glass CSS + radial bg
        ├── layout.tsx            # root layout
        ├── page.tsx              # landing + DB health badge
        └── api/health/route.ts   # GET health JSON
└── tests/
    └── health.test.ts            # unit tests for getHealth
```

Responsibilities: `lib/` = framework-agnostic logic (testable), `components/` = presentational UI, `app/` = routing/composition. `getHealth` lives in `lib/` so it has no Next/HTTP dependency and is trivially unit-tested.

---

## Task 1: Project scaffold & dependencies

**Files:**
- Create: `package.json`, `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "klingdom-forge",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "next": "14.2.35",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "prisma": "^5.22.0",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` appear.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.mjs tsconfig.json postcss.config.mjs
git commit -m "chore: scaffold Next.js 14 + TypeScript project"
```

---

## Task 2: Tailwind theme + global styles (EngZone tokens)

**Files:**
- Create: `tailwind.config.ts`
- Create: `src/app/globals.css`

- [ ] **Step 1: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        surface: "#14171f",
        "surface-2": "#1b1f2a",
        border: "#262b38",
        muted: "#8b93a4",
        accent: { DEFAULT: "#7c5cff", hover: "#6b4af0", soft: "#a78bfa" },
        ok: "#34d399",
        bad: "#f87171",
      },
      boxShadow: { "glow-accent": "0 8px 30px -8px rgba(124,92,255,0.55)" },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Create `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  background-color: #0b0d12;
  color: #e7e9ee;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
    Arial, sans-serif;
  background-image: radial-gradient(
      60% 50% at 20% 0%,
      rgba(124, 92, 255, 0.18),
      transparent 60%
    ),
    radial-gradient(50% 40% at 100% 10%, rgba(167, 139, 250, 0.12), transparent 60%);
  background-attachment: fixed;
}

.glass {
  background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.08),
      rgba(255, 255, 255, 0.02)
    ),
    rgba(28, 32, 44, 0.42);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.2),
    0 16px 40px -18px rgba(0, 0, 0, 0.7);
}

.glass-input {
  background: rgba(255, 255, 255, 0.06);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
```

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts src/app/globals.css
git commit -m "feat: Tailwind theme + glass global styles (EngZone tokens)"
```

---

## Task 3: Local Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env` (gitignored — `.gitignore` already excludes `.env`)

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    container_name: klingdom-forge-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: forge
      POSTGRES_PASSWORD: forge
      POSTGRES_DB: klingdom_forge
    ports:
      - "5432:5432"
    volumes:
      - forge_pgdata:/var/lib/postgresql/data

volumes:
  forge_pgdata:
```

- [ ] **Step 2: Create `.env.example`**

```
DATABASE_URL="postgresql://forge:forge@localhost:5432/klingdom_forge?schema=public"
```

- [ ] **Step 3: Create `.env` (local, not committed)**

```
DATABASE_URL="postgresql://forge:forge@localhost:5432/klingdom_forge?schema=public"
```

- [ ] **Step 4: Start the database**

Run: `npm run db:up`
Expected: `Container klingdom-forge-db  Started`. Verify with `docker compose ps` showing the container `running`.

- [ ] **Step 5: Verify connectivity**

Run: `docker exec klingdom-forge-db pg_isready -U forge`
Expected: `... accepting connections`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: local Postgres via docker-compose + env template"
```

---

## Task 4: Prisma setup + initial schema + migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`

- [ ] **Step 1: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  super_admin
  manager
  member
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(member)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

- [ ] **Step 2: Create the Prisma client singleton `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 3: Generate the client and run the first migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/`, applies it, prints `Your database is now in sync with your schema.` and generates the client.

- [ ] **Step 4: Verify the table exists**

Run: `docker exec klingdom-forge-db psql -U forge -d klingdom_forge -c '\dt'`
Expected: lists a `User` table (and `_prisma_migrations`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/db.ts
git commit -m "feat: Prisma + Postgres with initial User schema and migration"
```

---

## Task 5: Health check (TDD)

**Files:**
- Create: `vitest.config.ts`
- Test: `tests/health.test.ts`
- Create: `src/lib/health.ts`
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 2: Write the failing test `tests/health.test.ts`**

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/health` (module not found).

- [ ] **Step 4: Write the minimal implementation `src/lib/health.ts`**

```ts
export type HealthResult = {
  status: "ok" | "error";
  db: boolean;
  error?: string;
};

type HealthDb = { $queryRaw: (...args: unknown[]) => Promise<unknown> };

export async function getHealth(db: HealthDb): Promise<HealthResult> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", db: true };
  } catch (e) {
    return {
      status: "error",
      db: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 2 tests green.

- [ ] **Step 6: Wire the API route `src/app/api/health/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getHealth(db);
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tests/health.test.ts src/lib/health.ts src/app/api/health/route.ts
git commit -m "feat: db health check helper (TDD) + /api/health route"
```

---

## Task 6: Base UI components + layout + landing page

**Files:**
- Create: `src/components/ui.tsx`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/ui.tsx`**

```tsx
import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass rounded-xl p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header>
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
    </header>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
}) {
  const base = "rounded-xl px-4 py-2 text-sm font-medium transition";
  const styles =
    variant === "primary"
      ? "bg-accent text-white shadow-glow-accent hover:bg-accent-hover"
      : "glass-input text-white hover:bg-white/10";
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KlingDom Forge",
  description: "AI video generation studio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `src/app/page.tsx`**

```tsx
import { getHealth } from "@/lib/health";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const health = await getHealth(db);
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="KlingDom Forge" subtitle="AI video generation studio" />
      <Card className="mt-8">
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

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Boot the app and verify end-to-end**

Run (ensure DB is up first via `npm run db:up`): `npm run dev`
Then open `http://localhost:3000`.
Expected: dark page with purple radial glow, a frosted-glass card titled "KlingDom Forge", and a green `● connected` badge (the page read the live DB through Prisma).
Also verify: `curl -s http://localhost:3000/api/health` returns `{"status":"ok","db":true}`.

- [ ] **Step 6: Verify production build compiles**

Run: `npm run build`
Expected: build completes with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat: base glass UI components + landing page with live DB health badge"
```

---

## Done criteria for Milestone 1

- `npm run dev` serves a styled, glassmorphic landing page on `:3000`.
- The page shows a live DB-connectivity badge driven through Prisma → Postgres.
- `GET /api/health` returns `{status, db}` JSON.
- `npm test` passes (getHealth unit tests).
- `npm run build` compiles cleanly.
- All work committed in small, logical commits.

This foundation hands Milestone 2 (Auth & Roles & Workspace/Project) a working DB with a `User` model + `Role` enum, the Prisma client, the UI kit, and the glass design system to build on.
