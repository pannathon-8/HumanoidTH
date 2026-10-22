import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";

const protectedPrefixes = ["/admin", "/data-pulls"];
const protectedApiPrefixes = ["/api/ingest", "/api/export"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedApiPath(pathname: string) {
  return protectedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Protect Web Pages (Redirect to actual UI login page)
  if (isProtectedPath(pathname)) {
    const adminSession = request.cookies.get("admin_session")?.value;
    if (!(await verifyAdminSession(adminSession))) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // 2. Protect API Routes (Return 401 JSON without WWW-Authenticate header to prevent browser popups)
  if (isProtectedApiPath(pathname)) {
    if (await verifyAdminSession(request.cookies.get("admin_session")?.value)) return NextResponse.next();

    return new NextResponse(JSON.stringify({ error: "Unauthorized. Admin credentials required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/data-pulls/:path*", "/api/ingest/:path*", "/api/export"]
};
