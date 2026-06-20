import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getHealth(db);
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
