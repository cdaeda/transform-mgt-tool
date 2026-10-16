import { NextResponse, type NextRequest } from "next/server";

// The app can edit a shared spreadsheet, so keep it behind one shared password.
// ponytail: single shared password; swap for real per-user auth if more teams use it.
export function proxy(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  const [, b64] = (req.headers.get("authorization") ?? "").split(" ");
  const supplied = b64 ? atob(b64).split(":").slice(1).join(":") : "";
  if (supplied === pw) return NextResponse.next();
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Transform"' },
  });
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
