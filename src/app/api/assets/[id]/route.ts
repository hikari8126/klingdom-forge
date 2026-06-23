import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getProjectForUser } from "@/lib/projects";
import { getStorage } from "@/lib/storage";
import { mimeForFilename } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const asset = await db.asset.findUnique({ where: { id: params.id } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  // Access boundary: must be able to see the asset's project.
  const access = await getProjectForUser(user, asset.projectId);
  if (!access) return new NextResponse("Forbidden", { status: 403 });

  try {
    const bytes = await getStorage().read(asset.storageKey);
    const type = asset.mimeType ?? mimeForFilename(asset.filename);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("File missing", { status: 404 });
  }
}
