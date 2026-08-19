import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/admin-auth";

export const config = {
  matcher: ["/admin/:path*"],
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    // Fail closed: an unset password must never mean "everyone is admin".
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?error=unconfigured";
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await isValidAdminToken(token, password)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}
