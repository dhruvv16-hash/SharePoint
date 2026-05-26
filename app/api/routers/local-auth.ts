import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as cookie from "cookie";
import { nanoid } from "nanoid";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "../lib/cookies";
import { signSessionToken } from "../kimi/session";
import { env } from "../lib/env";
import {
  clearLocalSessions,
  deleteLocalUser,
  getLocalUserById,
  ensureLocalUserUnionId,
  listLocalDevices,
  listLocalSessions,
  findLocalUserByUsernameOrEmail,
  recordLocalSession,
  revokeLocalDevice,
  setLocalDeviceTrust,
  updateLocalUserLastSignIn,
  updateLocalUserSecurity,
  upsertLocalUser,
} from "../queries/local-auth-store";

function appendSessionCookie(ctx: { req: { headers: Headers }; resHeaders: Headers }, unionId: string) {
  const cookieOptions = getSessionCookieOptions(ctx.req.headers);
  return signSessionToken({
    unionId,
    clientId: env.appId || "local-auth",
  }).then((token) => {
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, token, {
        httpOnly: cookieOptions.httpOnly,
        path: cookieOptions.path,
        sameSite: cookieOptions.sameSite?.toLowerCase() as "lax" | "none",
        secure: cookieOptions.secure,
        maxAge: Session.maxAgeMs / 1000,
      }),
    );
  });
}

function getRequestContext(req: Request) {
  const headers = req.headers;
  const userAgent = headers.get("user-agent");
  const forwardedFor = headers.get("x-forwarded-for");
  return {
    userAgent,
    ipAddress: forwardedFor ? forwardedFor.split(",")[0]?.trim() || null : null,
  };
}

export const localAuthRouter = createRouter({
  signup: publicQuery
    .input(
      z.object({
        username: z.string().min(3).max(100),
        email: z.string().email(),
        password: z.string().min(8).max(100),
        displayName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!process.env.DATABASE_URL) {
        const existingUser = findLocalUserByUsernameOrEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already registered",
          });
        }

        const existingUsername = findLocalUserByUsernameOrEmail(input.username);
        if (existingUsername) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Username already taken",
          });
        }

        const passwordHash = await bcrypt.hash(input.password, 12);
        const user = upsertLocalUser({
          username: input.username,
          email: input.email,
          passwordHash,
          displayName: input.displayName || input.username,
          name: input.displayName || input.username,
          role: "user",
          plan: "free",
          storageQuota: 10737418240,
          storageUsed: 0,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          unionId: `local_${nanoid()}`,
        });

        await appendSessionCookie(ctx, user.unionId);

        return {
          success: true,
          userId: user.id,
        };
      }

      const db = getDb();
      const unionId = `local_${nanoid()}`;

      const existingUser = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already registered",
        });
      }

      const existingUsername = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, input.username))
        .limit(1);

      if (existingUsername.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Username already taken",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 12);

      const result = await db.insert(schema.users).values({
        unionId,
        username: input.username,
        email: input.email,
        passwordHash,
        displayName: input.displayName || input.username,
        name: input.displayName || input.username,
        role: "user",
        plan: "free",
        storageQuota: 10737418240,
        storageUsed: 0,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await appendSessionCookie(ctx, unionId);

      return {
        success: true,
        userId: Number(result[0].insertId),
      };
    }),

  login: publicQuery
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!process.env.DATABASE_URL) {
        const user = findLocalUserByUsernameOrEmail(input.username);
        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }

        if (!user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Please login with OAuth",
          });
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }

        const sessionUser = updateLocalUserLastSignIn(ensureLocalUserUnionId(user));
        const requestInfo = getRequestContext(ctx.req);
        recordLocalSession(sessionUser.id, {
          event: "sign-in",
          userAgent: requestInfo.userAgent,
          ipAddress: requestInfo.ipAddress,
        });
        await appendSessionCookie(ctx, sessionUser.unionId);

        return {
          success: true,
          user: {
            id: sessionUser.id,
            username: sessionUser.username,
            email: sessionUser.email,
            displayName: sessionUser.displayName,
            name: sessionUser.name,
            avatar: sessionUser.avatar,
            role: sessionUser.role,
            plan: sessionUser.plan,
          },
        };
      }

      const db = getDb();

      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, input.username))
        .limit(1);

      if (users.length === 0) {
        // Also try email login
        const emailUsers = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, input.username))
          .limit(1);

        if (emailUsers.length === 0) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }

        const user = emailUsers[0];
        if (!user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Please login with OAuth",
          });
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid credentials",
          });
        }

        await db
          .update(schema.users)
          .set({ lastSignInAt: new Date() })
          .where(eq(schema.users.id, user.id));

        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            name: user.name,
            avatar: user.avatar,
            role: user.role,
            plan: user.plan,
          },
        };
      }

      const user = users[0];
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Please login with OAuth",
        });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const unionId = user.unionId ?? `local_${nanoid()}`;
      if (!user.unionId) {
        await db
          .update(schema.users)
          .set({ unionId, updatedAt: new Date() })
          .where(eq(schema.users.id, user.id));
      }

      await db
        .update(schema.users)
        .set({ lastSignInAt: new Date() })
        .where(eq(schema.users.id, user.id));

      await appendSessionCookie(ctx, unionId);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          plan: user.plan,
        },
      };
    }),

  updateProfile: publicQuery
    .input(
      z.object({
        displayName: z.string().optional(),
        email: z.string().email().optional(),
        avatar: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const updated = updateLocalUserSecurity(ctx.user.id, input);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        return { success: true };
      }

      const db = getDb();
      await db
        .update(schema.users)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, ctx.user.id));

      return { success: true };
    }),

  changePassword: publicQuery
    .input(
      z.object({
        oldPassword: z.string(),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const user = getLocalUserById(ctx.user.id);
        if (!user || !user.passwordHash) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No password set" });
        }

        const valid = await bcrypt.compare(input.oldPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid old password" });
        }

        const updated = upsertLocalUser({
          ...user,
          passwordHash: await bcrypt.hash(input.newPassword, 12),
          updatedAt: new Date(),
        });
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        return { success: true };
      }

      const db = getDb();
      const users = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, ctx.user.id))
        .limit(1);

      const user = users[0];
      if (!user.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No password set",
        });
      }

      const valid = await bcrypt.compare(input.oldPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid old password",
        });
      }

      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db
        .update(schema.users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(schema.users.id, ctx.user.id));

      return { success: true };
    }),

  devices: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalDevices(ctx.user.id);
    }

    return [];
  }),

  sessions: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalSessions(ctx.user.id);
    }

    return [];
  }),

  updateSecurity: publicQuery
    .input(
      z.object({
        twoFactorEnabled: z.boolean().optional(),
        encryptionMode: z.enum(["standard", "zero_knowledge"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const updated = updateLocalUserSecurity(ctx.user.id, input);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }
        return { success: true };
      }

      return { success: true };
    }),

  trustDevice: publicQuery
    .input(z.object({ deviceId: z.string(), trusted: z.boolean().default(true) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const device = setLocalDeviceTrust(ctx.user.id, input.deviceId, input.trusted);
        if (!device) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
        }
        const trustedDevices = (getLocalUserById(ctx.user.id)?.trustedDevices || []).filter(Boolean);
        if (input.trusted && !trustedDevices.includes(device.deviceName)) {
          trustedDevices.push(device.deviceName);
        }
        updateLocalUserSecurity(ctx.user.id, { trustedDevices });
        return { success: true };
      }

      return { success: true };
    }),

  revokeDevice: publicQuery
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const revoked = revokeLocalDevice(ctx.user.id, input.deviceId);
        if (!revoked) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
        }
        return { success: true };
      }

      return { success: true };
    }),

  logoutAllDevices: publicQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      clearLocalSessions(ctx.user.id);
      return { success: true };
    }

    return { success: true };
  }),

  deleteAccount: publicQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      deleteLocalUser(ctx.user.id);
      return { success: true };
    }

    return { success: true };
  }),
});
