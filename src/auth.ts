import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { isAllowedEmail, resolveRole } from "@/lib/auth-policy";

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? "crossian.com";
const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Trust the host header — required behind the reverse proxy on the VPS so
  // Auth.js builds correct callback/redirect URLs (set AUTH_URL explicitly in
  // production if you prefer pinning it).
  trustHost: true,
  callbacks: {
    // Gate: only verified emails in the allowed Workspace domain may sign in.
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email) return false;
      if ((profile as { email_verified?: boolean })?.email_verified === false) return false;
      return isAllowedEmail(email, allowedDomain);
    },
    // On sign-in (profile present), upsert the user and resolve their global role.
    async jwt({ token, profile, account }) {
      if (account?.access_token) {
        token.googleAccessToken = account.access_token;
        token.googleAccessTokenExpiresAt = account.expires_at;
      }
      if (profile?.email) {
        const email = profile.email.toLowerCase();
        const existing = await db.user.findUnique({ where: { email } });
        const role = resolveRole(email, superAdminEmails, existing?.role ?? null);
        const name = (profile.name as string | undefined) ?? null;
        const image = (profile as { picture?: string }).picture ?? null;
        const user = await db.user.upsert({
          where: { email },
          create: { email, name, image, role },
          update: { name, image, role },
        });
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Cast to record to stamp JWT claims; type is widened in next-auth.d.ts
        const u = session.user as unknown as Record<string, unknown>;
        u["id"] = token.userId ?? "";
        if (token.role) u["role"] = token.role;
      }
      const googleAccessTokenExpiresAt =
        typeof token.googleAccessTokenExpiresAt === "number"
          ? token.googleAccessTokenExpiresAt
          : null;
      if (
        token.googleAccessToken &&
        (!googleAccessTokenExpiresAt || googleAccessTokenExpiresAt * 1000 > Date.now() + 60_000)
      ) {
        (session as unknown as Record<string, unknown>)["googleAccessToken"] = token.googleAccessToken;
      }
      return session;
    },
  },
});
