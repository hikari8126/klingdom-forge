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
