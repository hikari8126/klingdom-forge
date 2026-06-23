import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const video = await db.libraryVideo.findUnique({ where: { id: params.id } });
  if (!video) return new NextResponse("Not found", { status: 404 });

  try {
    const bytes = await getStorage().read(video.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": video.mimeType ?? "video/mp4", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
