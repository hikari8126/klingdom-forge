import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { listLibraryVideos } from "@/lib/library-videos";
import { Card, Button, TextInput } from "@/components/ui";
import { BackButton } from "@/components/BackButton";
import {
  uploadLibraryVideoAction,
  deleteLibraryVideoAction,
  deleteLibraryVideosAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireUser();
  if (user.role !== "super_admin") notFound();
  const videos = await listLibraryVideos();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <BackButton />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Thư viện video Motion Control</h1>
        <p className="mt-1 text-sm text-muted">
          Video template dùng chung cho mọi workspace. Super Admin có thể upload một
          hoặc nhiều video, và xoá từng video hoặc xoá nhiều video cùng lúc.
        </p>
      </div>

      {/* Upload */}
      <Card className="mb-6">
        <p className="mono mb-3 text-muted">Upload 1 hoặc nhiều video vào thư viện</p>
        <form action={uploadLibraryVideoAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1" style={{ minWidth: 180 }}>
            <span className="mono text-[10px] text-muted">Tên hiển thị / prefix (tuỳ chọn)</span>
            <TextInput name="name" placeholder="vd: Gật đầu nhẹ" />
          </label>
          <label className="flex flex-col gap-1 flex-1" style={{ minWidth: 200 }}>
            <span className="mono text-[10px] text-muted">File video (.mp4 / .mov, tối đa 100 MB)</span>
            <input
              type="file"
              name="files"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              multiple
              required
              className="glass-input rounded-xl px-3 py-2 text-sm text-white file:mr-2 file:rounded-lg file:border-0 file:bg-accent/20 file:px-2 file:py-1 file:text-xs file:text-accent-soft"
            />
          </label>
          <Button type="submit">+ Upload</Button>
        </form>
      </Card>

      {/* List */}
      <Card className="overflow-hidden !p-0">
        <form action={deleteLibraryVideosAction}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="mono text-muted">Video templates</p>
            <p className="mt-1 text-xs text-muted">
              Chọn checkbox để xoá nhiều template cùng lúc.
            </p>
          </div>
          <Button type="submit" variant="ghost" className="border-bad/40 text-bad hover:bg-bad/10">
            Xoá video đã chọn
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left mono text-[10px] text-muted">
                <th className="w-10 px-4 py-3 font-normal">Chọn</th>
                <th className="px-4 py-3 font-normal">Preview</th>
                <th className="px-4 py-3 font-normal">Tên</th>
                <th className="px-4 py-3 font-normal">File</th>
                <th className="px-4 py-3 font-normal">Ngày tải</th>
                <th className="px-4 py-3 text-right font-normal">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {videos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    Thư viện trống — upload video ở trên để bắt đầu.
                  </td>
                </tr>
              )}
              {videos.map((v) => (
                <tr key={v.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={v.id}
                      aria-label={`Chọn ${v.name}`}
                      className="h-4 w-4 rounded border-border bg-surface-2 accent-accent"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <video
                      src={`/api/library/${v.id}`}
                      preload="metadata"
                      muted
                      className="h-14 w-20 rounded-lg object-cover bg-black"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{v.name}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{v.filename}</td>
                  <td className="px-4 py-3 text-muted">{new Date(v.createdAt).toLocaleDateString("vi-VN")}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="submit"
                      formAction={deleteLibraryVideoAction}
                      name="id"
                      value={v.id}
                      className="text-xs text-muted hover:text-bad"
                    >
                      Xoá
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </form>
      </Card>
    </main>
  );
}
