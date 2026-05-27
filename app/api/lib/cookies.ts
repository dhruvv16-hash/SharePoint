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

  // In local HTTP development, we must not enforce the Secure flag on cookies.
  return false;
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
