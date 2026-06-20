import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listAccountsForAdmin } from "@/lib/kling-accounts";
import { Card, PageHeader, Button, TextInput } from "@/components/ui";
import { createKlingAccountAction, setAccountEnabledAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KlingAccountsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") notFound();
  const accounts = await listAccountsForAdmin(user);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <PageHeader title="Kling Accounts" subtitle="Khoá API Kling dùng chung (chỉ Super Admin)" />

      <Card className="mt-8">
        <form action={createKlingAccountAction} className="grid gap-2">
          <TextInput name="label" placeholder="Nhãn (vd: KlingAccount #1)" required />
          <TextInput name="accessKey" placeholder="Access Key" required />
          <TextInput name="secretKey" placeholder="Secret Key" required />
          <TextInput name="maxConcurrent" type="number" defaultValue={5} min={1} placeholder="Max concurrent" />
          <Button type="submit">Thêm account</Button>
        </form>
      </Card>

      <div className="mt-4 space-y-2">
        {accounts.length === 0 && (
          <Card><p className="text-muted">Chưa có account nào. Thêm khoá Kling để bắt đầu tạo video.</p></Card>
        )}
        {accounts.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <span className="text-white">
                {a.label}{" "}
                <span className="text-muted">· max {a.maxConcurrent} ·</span>{" "}
                <span className={a.enabled ? "text-ok" : "text-bad"}>{a.enabled ? "bật" : "tắt"}</span>
              </span>
              <form action={setAccountEnabledAction}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="enabled" value={a.enabled ? "false" : "true"} />
                <Button variant="ghost" type="submit">{a.enabled ? "Tắt" : "Bật"}</Button>
              </form>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
