"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createLibraryVideo, deleteLibraryVideo, deleteLibraryVideos } from "@/lib/library-videos";
import { assertVideoSize } from "@/lib/uploads";

export async function uploadLibraryVideoAction(formData: FormData) {
  const actor = await requireUser();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const name = String(formData.get("name") ?? "").trim();
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    assertVideoSize(buf, f.name);
    const baseName = f.name.replace(/\.[^.]+$/, "");
    const displayName = files.length === 1 ? (name || baseName) : (name ? `${name} · ${baseName}` : baseName);
    await createLibraryVideo(actor, displayName, f.name, buf);
  }
  revalidatePath("/admin/library");
}

export async function deleteLibraryVideoAction(formData: FormData) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  await deleteLibraryVideo(actor, id);
  revalidatePath("/admin/library");
}

export async function deleteLibraryVideosAction(formData: FormData) {
  const actor = await requireUser();
  const ids = formData.getAll("ids").map((id) => String(id));
  await deleteLibraryVideos(actor, ids);
  revalidatePath("/admin/library");
}
