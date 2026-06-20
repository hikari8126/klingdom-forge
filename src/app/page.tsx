import Link from "next/link";
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

      <Link href="/workspaces" className="mt-4 inline-block">
        <Button>Vào Workspaces →</Button>
      </Link>
    </main>
  );
}
