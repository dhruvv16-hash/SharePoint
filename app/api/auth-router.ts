import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery } from "./middleware";
import { recordLocalSession } from "./queries/local-auth-store";

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  logout: authedQuery.mutation(async ({ ctx }) => {
    if (!process.env.DATABASE_URL && ctx.user) {
      recordLocalSession(ctx.user.id, {
        event: "sign-out",
        userAgent: ctx.req.headers.get("user-agent"),
        ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      });
    }

    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
