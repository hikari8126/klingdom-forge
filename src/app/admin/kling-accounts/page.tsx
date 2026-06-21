import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listAccountsForAdmin } from "@/lib/kling-accounts";
import { Card, Button, TextInput } from "@/components/ui";
import { BackButton } from "@/components/BackButton";
import { createKlingAccountAction, setAccountEnabledAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function KlingAccountsPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") notFound();
  const accounts = await listAccountsForAdmin(user);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <BackButton />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kling Accounts</h1>
          <p className="mt-1 text-sm text-muted">
            Khoá API Kling dùng chung cho cả workspace. Giữ bí mật, chỉ Super Admin thấy trang này.
          </p>
        </div>
      </div>

      {/* Add account (API Key only — no secret) */}
      <Card className="mb-6">
        <div className="mb-3 mono text-muted">Thêm API Key</div>
        <form action={createKlingAccountAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1" style={{ minWidth: 160 }}>
            <span className="mono text-[10px] text-muted">Nhãn</span>
            <TextInput name="label" placeholder="vd: KlingAccount #1" required />
          </label>
          <label className="flex flex-[2] flex-col gap-1" style={{ minWidth: 220 }}>
            <span className="mono text-[10px] text-muted">API Key</span>
            <TextInput name="accessKey" type="password" placeholder="api-key-kling-…" required />
          </label>
          <label className="flex flex-col gap-1" style={{ width: 120 }}>
            <span className="mono text-[10px] text-muted">Max concurrent</span>
            <TextInput name="maxConcurrent" type="number" defaultValue={5} min={1} />
          </label>
          <Button type="submit">+ Thêm</Button>
        </form>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left mono text-[10px] text-muted">
                <th className="px-4 py-3 font-normal">Tên</th>
                <th className="px-4 py-3 font-normal">API Key</th>
                <th className="px-4 py-3 font-normal">Concurrency</th>
                <th className="px-4 py-3 font-normal">Trạng thái</th>
                <th className="px-4 py-3 font-normal">Tạo lúc</th>
                <th className="px-4 py-3 text-right font-normal">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Chưa có account nào — thêm API Key ở trên để bắt đầu tạo video.
                  </td>
                </tr>
              )}
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-white">{a.label}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">•••••••• (đã mã hoá)</td>
                  <td className="px-4 py-3 text-muted">{a.maxConcurrent}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 ${a.enabled ? "text-ok" : "text-muted"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-ok" : "bg-muted"}`} />
                      {a.enabled ? "Đang bật" : "Tắt"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(a.createdAt).toLocaleDateString("vi-VN")}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={setAccountEnabledAction} className="inline">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="enabled" value={a.enabled ? "false" : "true"} />
                      <button type="submit" className={`text-xs ${a.enabled ? "text-muted hover:text-bad" : "text-accent-soft hover:text-accent"}`}>
                        {a.enabled ? "Tắt" : "Bật"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
