import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Workspace settings now live in the single unified Settings panel (opened via ?settings=workspace).
export default function WorkspaceDetailPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  redirect(`/workspaces?settings=workspace&ws=${params.workspaceId}`);
}
