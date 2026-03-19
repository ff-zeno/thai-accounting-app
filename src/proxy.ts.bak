import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale, localeCookieName, type Locale } from "@/i18n/config";

export default function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Set locale cookie if missing (cookie-based detection, no URL prefix)
  const existing = request.cookies.get(localeCookieName)?.value;
  if (!existing || !locales.includes(existing as Locale)) {
    // Detect from Accept-Language header or fall back to default
    const acceptLang = request.headers.get("accept-language") ?? "";
    const detected = locales.find((l) => acceptLang.includes(l));
    response.cookies.set(localeCookieName, detected ?? defaultLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
