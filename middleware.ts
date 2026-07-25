import { NextRequest, NextResponse } from "next/server";

// Password-protects the dashboard PAGES (Overview / Settings / Queue) with
// HTTP Basic Auth. The /api/* routes are deliberately NOT matched, so the
// GitHub Actions timers (which call /api/generate and /api/publish with the
// CRON_SECRET header) keep working with no bypass needed.
//
// Password source: DASHBOARD_PASSWORD if set, else CRON_SECRET (already in
// your env). Username can be anything. If neither is set, the dashboard is
// left open (e.g. local dev).
export const config = {
  matcher: ["/", "/settings", "/queue"],
};

export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD || process.env.CRON_SECRET;
  if (!password) return NextResponse.next(); // not configured -> open

  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const sep = decoded.indexOf(":");
    const supplied = sep >= 0 ? decoded.slice(sep + 1) : "";
    if (supplied === password) return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ForgeBuzz Control Room"' },
  });
}
