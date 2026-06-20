export type HealthResult = {
  status: "ok" | "error";
  db: boolean;
  error?: string;
};

type HealthDb = { $queryRaw: (...args: unknown[]) => Promise<unknown> };

export async function getHealth(db: HealthDb): Promise<HealthResult> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", db: true };
  } catch (e) {
    return {
      status: "error",
      db: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
