"use client";

import { useRouter } from "next/navigation";

/** Small "back" control for management pages. Falls back to a path if there's no history. */
export function BackButton({ fallback = "/workspaces" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push(fallback))}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-accent-soft"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
      Quay lại
    </button>
  );
}
