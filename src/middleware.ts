// NOTE: this imports the full auth config (which pulls in Prisma). That is fine
// because we deploy on a Node runtime (next start / pm2 on the VPS), where the
// middleware runs in Node — NOT Vercel Edge. If this ever ships to a true edge
// runtime, split out an edge-safe auth.config.ts (no Prisma) for the middleware.
import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") || pathname.startsWith("/api/auth");
  if (!req.auth && !isPublic) {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
