import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  adminToken,
  safeEqual,
} from "@/lib/admin-auth";

function redirectTarget(request: Request, next: string | null): URL {
  // Only allow same-site admin paths, so ?next= cannot bounce anyone offsite.
  const safeNext = next && next.startsWith("/admin") ? next : "/admin";
  return new URL(safeNext, request.url);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const submitted = String(form.get("password") ?? "");
  const next = form.get("next");
  const nextPath = typeof next === "string" ? next : null;

  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return NextResponse.redirect(
      new URL("/admin/login?error=unconfigured", request.url),
      { status: 303 },
    );
  }

  if (!safeEqual(submitted, password)) {
    const url = new URL("/admin/login?error=invalid", request.url);
    if (nextPath) url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(redirectTarget(request, nextPath), {
    status: 303,
  });
  response.cookies.set(ADMIN_COOKIE, await adminToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return response;
}
