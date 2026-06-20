"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { createKlingAccount, setAccountEnabled } from "@/lib/kling-accounts";

export async function createKlingAccountAction(formData: FormData) {
  const actor = await requireUser();
  await createKlingAccount(actor, {
    label: String(formData.get("label") ?? ""),
    accessKey: String(formData.get("accessKey") ?? ""),
    secretKey: String(formData.get("secretKey") ?? ""),
    maxConcurrent: Number(formData.get("maxConcurrent") ?? 5),
  });
  revalidatePath("/admin/kling-accounts");
}

export async function setAccountEnabledAction(formData: FormData) {
  const actor = await requireUser();
  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  await setAccountEnabled(actor, id, enabled);
  revalidatePath("/admin/kling-accounts");
}
