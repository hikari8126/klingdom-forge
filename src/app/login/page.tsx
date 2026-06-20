import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { Card, PageHeader, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Card>
        <PageHeader
          title="KlingDom Forge"
          subtitle="Đăng nhập bằng tài khoản Google công ty"
        />
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Đăng nhập với Google
          </Button>
        </form>
      </Card>
    </main>
  );
}
