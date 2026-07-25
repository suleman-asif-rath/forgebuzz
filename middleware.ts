import { NextRequest, NextResponse } from "next/server";

// Password-protects the dashboard PAGES (Overview / Settings / Queue) with
// HTTP Basic Auth. The /api/* routes are NOT matched, so the GitHub Actions
// timers keep working with no bypass needed.
//
// Credentials: username "root" (override with DASHBOARD_USER) and a password
// checked against the SHA-256 below. Set DASHBOARD_PASSWORD in the env to use
// your own password instead. Only the hash lives in the repo, never the
// plaintext. Left open during local development.
export const config = {
  matcher: ["/", "/settings", "/queue"],
};

const USERNAME = process.env.DASHBOARD_USER || "root";
const PASSWORD_SHA256 = "6b8ce9b21351a919f1872b36ca6c10ad875520409d0c40b01369726c3c42f6b6";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ForgeBuzz Control Room"' },
  });
}

export async function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }
  const sep = decoded.indexOf(":");
  const user = sep >= 0 ? decoded.slice(0, sep) : "";
  const pass = sep >= 0 ? decoded.slice(sep + 1) : decoded;

  if (user !== USERNAME) return unauthorized();

  const override = process.env.DASHBOARD_PASSWORD;
  const ok = override ? pass === override : (await sha256Hex(pass)) === PASSWORD_SHA256;
  return ok ? NextResponse.next() : unauthorized();
}
