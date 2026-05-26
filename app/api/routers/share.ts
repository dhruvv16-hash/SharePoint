import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  createLocalShare,
  getLocalShareByToken,
  getLocalFile,
  getLocalFolder,
  logLocalShareDownload,
  listLocalShares,
  revokeLocalShare,
  verifyLocalSharePassword,
} from "../queries/local-content-store";

function generateShareToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const shareRouter = createRouter({
  create: publicQuery
    .input(
      z.object({
        fileId: z.number().optional(),
        folderId: z.number().optional(),
        shareType: z.enum(["private", "password", "public", "team"]).default("private"),
        password: z.string().optional(),
        permissions: z.enum(["read", "write", "upload", "admin"]).default("read"),
        maxDownloads: z.number().optional(),
        expiresIn: z.number().optional(), // hours
        requireAuth: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!input.fileId && !input.folderId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "fileId or folderId required" });
      }

      if (!process.env.DATABASE_URL) {
        if (input.fileId && !getLocalFile(ctx.user.id, input.fileId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
        }
        if (input.folderId && !getLocalFolder(ctx.user.id, input.folderId)) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
        }

        const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;
        const share = createLocalShare(ctx.user.id, {
          fileId: input.fileId,
          folderId: input.folderId,
          shareType: input.shareType,
          passwordHash,
          permissions: input.permissions,
          maxDownloads: input.maxDownloads,
          expiresIn: input.expiresIn,
          requireAuth: input.requireAuth,
        });

        return {
          shareId: share.id,
          token: share.token,
          shareUrl: `/share/${share.token}`,
          expiresAt: share.expiresAt,
        };
      }

      const db = getDb();
      const token = generateShareToken();
      const expiresAt = input.expiresIn
        ? new Date(Date.now() + input.expiresIn * 3600000)
        : null;

      const passwordHash = input.password
        ? await bcrypt.hash(input.password, 10)
        : null;

      const result = await db.insert(schema.shares).values({
        userId: ctx.user.id,
        fileId: input.fileId || null,
        folderId: input.folderId || null,
        token,
        shareType: input.shareType,
        passwordHash,
        permissions: input.permissions,
        maxDownloads: input.maxDownloads || null,
        expiresAt,
        requireAuth: input.requireAuth,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        shareId: Number(result[0].insertId),
        token,
        shareUrl: `/share/${token}`,
        expiresAt,
      };
    }),

  list: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalShares(ctx.user.id);
    }

    const db = getDb();
    const shares = await db
      .select()
      .from(schema.shares)
      .where(eq(schema.shares.userId, ctx.user.id));

    return shares;
  }),

  revoke: publicQuery
    .input(z.object({ shareId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        revokeLocalShare(ctx.user.id, input.shareId);
        return { success: true };
      }

      const db = getDb();
      await db
        .update(schema.shares)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(eq(schema.shares.id, input.shareId), eq(schema.shares.userId, ctx.user.id))
        );

      return { success: true };
    }),

  access: publicQuery
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        const share = getLocalShareByToken(input.token);
        if (!share) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
        }

        if (!share.isActive) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Share revoked" });
        }

        if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Share expired" });
        }

        const resource = share.fileId
          ? getLocalFile(share.userId, share.fileId)
          : share.folderId
            ? getLocalFolder(share.userId, share.folderId)
            : null;

        return {
          share: {
            token: share.token,
            shareType: share.shareType,
            permissions: share.permissions,
            requireAuth: share.requireAuth,
            expiresAt: share.expiresAt,
            maxDownloads: share.maxDownloads,
            downloadCount: share.downloadCount,
          },
          resource,
          requirePassword: !!share.passwordHash && share.shareType === "password",
        };
      }

      const db = getDb();
      const shares = await db
        .select()
        .from(schema.shares)
        .where(eq(schema.shares.token, input.token))
        .limit(1);

      if (shares.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      }

      const share = shares[0];

      if (!share.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Share revoked" });
      }

      if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Share expired" });
      }

      if (share.maxDownloads && (share.downloadCount || 0) >= share.maxDownloads) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Download limit reached" });
      }

      // Get file/folder info
      let resource = null;
      if (share.fileId) {
        const files = await db
          .select()
          .from(schema.files)
          .where(eq(schema.files.id, share.fileId))
          .limit(1);
        resource = files[0] || null;
      } else if (share.folderId) {
        const folders = await db
          .select()
          .from(schema.folders)
          .where(eq(schema.folders.id, share.folderId))
          .limit(1);
        resource = folders[0] || null;
      }

      return {
        share: {
          token: share.token,
          shareType: share.shareType,
          permissions: share.permissions,
          requireAuth: share.requireAuth,
          expiresAt: share.expiresAt,
          maxDownloads: share.maxDownloads,
          downloadCount: share.downloadCount,
        },
        resource,
        requirePassword: !!share.passwordHash && share.shareType === "password",
      };
    }),

  verifyPassword: publicQuery
    .input(z.object({ token: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        const result = verifyLocalSharePassword(input.token, input.password);
        if (!result.share) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
        }

        return { valid: result.valid };
      }

      const db = getDb();
      const shares = await db
        .select()
        .from(schema.shares)
        .where(eq(schema.shares.token, input.token))
        .limit(1);

      if (shares.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      }

      const share = shares[0];
      if (!share.passwordHash) {
        return { valid: true };
      }

      const valid = await bcrypt.compare(input.password, share.passwordHash);
      return { valid };
    }),

  logDownload: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        logLocalShareDownload(input.token);
        return { success: true };
      }

      const db = getDb();
      const shares = await db
        .select()
        .from(schema.shares)
        .where(eq(schema.shares.token, input.token))
        .limit(1);

      if (shares.length > 0) {
        await db
          .update(schema.shares)
          .set({
            downloadCount: (shares[0].downloadCount || 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(schema.shares.id, shares[0].id));
      }

      return { success: true };
    }),
});
