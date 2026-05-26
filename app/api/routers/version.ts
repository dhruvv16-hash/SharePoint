import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  createLocalVersion,
  deleteLocalVersion,
  listLocalVersions,
  restoreLocalVersion,
} from "../queries/local-content-store";

export const versionRouter = createRouter({
  list: publicQuery
    .input(z.object({ fileId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return listLocalVersions(ctx.user.id, input.fileId);
      }

      const db = getDb();

      // Verify file ownership
      const file = await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.id, input.fileId))
        .limit(1);

      if (file.length === 0 || file[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const versions = await db
        .select()
        .from(schema.fileVersions)
        .where(eq(schema.fileVersions.fileId, input.fileId))
        .orderBy(desc(schema.fileVersions.versionNumber));

      return versions;
    }),

  create: publicQuery
    .input(
      z.object({
        fileId: z.number(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const version = createLocalVersion(ctx.user.id, input.fileId, input.comment);
        if (!version) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        return { success: true, versionNumber: version.versionNumber };
      }

      const db = getDb();

      const file = await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.id, input.fileId))
        .limit(1);

      if (file.length === 0 || file[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const currentVersion = file[0].versionCount || 1;
      const newVersion = currentVersion + 1;

      await db.insert(schema.fileVersions).values({
        fileId: input.fileId,
        versionNumber: newVersion,
        name: file[0].name,
        storagePath: file[0].storagePath,
        size: file[0].size,
        checksum: file[0].checksum,
        comment: input.comment || `Version ${newVersion}`,
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });

      await db
        .update(schema.files)
        .set({ versionCount: newVersion, updatedAt: new Date() })
        .where(eq(schema.files.id, input.fileId));

      return { success: true, versionNumber: newVersion };
    }),

  restore: publicQuery
    .input(
      z.object({
        fileId: z.number(),
        versionId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const version = restoreLocalVersion(ctx.user.id, input.fileId, input.versionId);
        if (!version) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        }
        return { success: true };
      }

      const db = getDb();

      const file = await db
        .select()
        .from(schema.files)
        .where(eq(schema.files.id, input.fileId))
        .limit(1);

      if (file.length === 0 || file[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const version = await db
        .select()
        .from(schema.fileVersions)
        .where(eq(schema.fileVersions.id, input.versionId))
        .limit(1);

      if (version.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      // Restore file to this version
      await db
        .update(schema.files)
        .set({
          storagePath: version[0].storagePath,
          size: version[0].size,
          checksum: version[0].checksum,
          updatedAt: new Date(),
        })
        .where(eq(schema.files.id, input.fileId));

      return { success: true };
    }),

  delete: publicQuery
    .input(z.object({ versionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        deleteLocalVersion(ctx.user.id, input.versionId);
        return { success: true };
      }

      const db = getDb();
      await db.delete(schema.fileVersions).where(eq(schema.fileVersions.id, input.versionId));

      return { success: true };
    }),
});
