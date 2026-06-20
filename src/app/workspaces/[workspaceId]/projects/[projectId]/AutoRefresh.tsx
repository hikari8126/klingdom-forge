"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Calls router.refresh() on an interval while there is active work to poll. */
export default function AutoRefresh({ active, ms = 4000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}
