import type { CookieOptions } from "hono/utils/cookie";

function isSecureRequest(headers: Headers): boolean {
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (forwardedProto === "https") {
    return true;
  }

  const forwardedSsl = headers.get("x-forwarded-ssl");
  if (forwardedSsl?.toLowerCase() === "on") {
    return true;
  }

  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const secure = isSecureRequest(headers);

  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure,
  };
}
