import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const video = await db.libraryVideo.findUnique({ where: { id: params.id } });
  if (!video) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await readFile(video.storedPath);
    const type = MIME[path.extname(video.storedPath).toLowerCase()] ?? "video/mp4";
    return new NextResponse(bytes, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
