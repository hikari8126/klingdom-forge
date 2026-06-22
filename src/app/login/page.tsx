import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { Card, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(var(--color-accent)/.28),transparent_70%)] blur-2xl" />
      <div className="relative w-full max-w-sm animate-fade-up text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-accent shadow-glow-accent">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="#04212c"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l5 3-5 3z" /></svg>
        </div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">KlingDom Forge</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          Studio dựng video AI hàng loạt — đăng nhập bằng tài khoản Google công ty.
        </p>

        <Card className="mt-8">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="flex w-full items-center justify-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 48 48" className="flex-none">
                <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
              </svg>
              Đăng nhập với Google
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted">Chỉ tài khoản @crossian.com được phép truy cập.</p>
        </Card>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-ok/40 px-3 py-1.5 mono text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_8px_rgb(var(--color-ok))]" />
          Hệ thống đang hoạt động
        </div>
      </div>
    </main>
  );
}
