import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * Proxy-download an output video as an attachment. The result video lives on a
 * remote (Kling) CDN, so a client-side `<a download>` can't force a save across
 * origins — this same-origin route streams it back with Content-Disposition.
 */
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const job = await db.job.findUnique({
    where: { id: params.jobId },
    select: { id: true, projectId: true, params: true, resultUrl: true },
  });
  if (!job) return new NextResponse("Not found", { status: 404 });

  // Access boundary: must be able to see the job's project.
  const access = await getProjectForUser(user, job.projectId);
  if (!access) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const slotRaw = url.searchParams.get("slot");
  const slot = slotRaw !== null ? Number(slotRaw) : null;
  const p = (job.params ?? {}) as { resultUrls?: (string | null)[] };
  const target =
    slot !== null && Number.isInteger(slot) && Array.isArray(p.resultUrls)
      ? p.resultUrls[slot] ?? null
      : job.resultUrl;
  if (!target) return new NextResponse("No output for this slot", { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(target);
  } catch {
    return new NextResponse("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Upstream error", { status: 502 });

  const rawName = url.searchParams.get("name") || params.jobId;
  const base = rawName.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || params.jobId;
  const filename = `${base}-output${(slot ?? 0) + 1}.mp4`;

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
