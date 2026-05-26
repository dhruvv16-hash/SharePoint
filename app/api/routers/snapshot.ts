import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  createLocalSnapshot,
  deleteLocalSnapshot,
  getLocalSnapshot,
  listLocalSnapshots,
} from "../queries/local-content-store";

export const snapshotRouter = createRouter({
  list: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalSnapshots(ctx.user.id);
    }

    const db = getDb();
    const snaps = await db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.userId, ctx.user.id))
      .orderBy(desc(schema.snapshots.createdAt));

    return snaps;
  }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        snapshotType: z.enum(["daily", "weekly", "manual"]).default("manual"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const snapshot = createLocalSnapshot(ctx.user.id, input);
        return {
          snapshotId: snapshot.id,
          name: snapshot.name,
          fileCount: snapshot.fileManifest?.length || 0,
          folderCount: Object.keys((snapshot.folderTree as Record<string, unknown>) || {}).length,
          size: snapshot.size || 0,
        };
      }

      const db = getDb();

      // Get current folder tree
      const allFolders = await db
        .select()
        .from(schema.folders)
        .where(
          and(
            eq(schema.folders.userId, ctx.user.id),
            eq(schema.folders.isDeleted, false)
          )
        );

      // Get current files
      const allFiles = await db
        .select()
        .from(schema.files)
        .where(
          and(
            eq(schema.files.userId, ctx.user.id),
            eq(schema.files.isDeleted, false)
          )
        );

      const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);

      const result = await db.insert(schema.snapshots).values({
        userId: ctx.user.id,
        name: input.name,
        snapshotType: input.snapshotType,
        folderTree: allFolders.reduce(
          (acc, f) => {
            acc[f.id] = f;
            return acc;
          },
          {} as Record<string, unknown>
        ),
        fileManifest: allFiles.map((f) => ({
          id: f.id,
          name: f.name,
          folderId: f.folderId,
          storagePath: f.storagePath,
          size: f.size,
          mimeType: f.mimeType,
          checksum: f.checksum,
        })),
        size: totalSize,
        createdAt: new Date(),
      });

      return {
        snapshotId: Number(result[0].insertId),
        name: input.name,
        fileCount: allFiles.length,
        folderCount: allFolders.length,
        size: totalSize,
      };
    }),

  restore: publicQuery
    .input(z.object({ snapshotId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const snapshot = getLocalSnapshot(ctx.user.id, input.snapshotId);
        if (!snapshot) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
        }

        return { success: true, snapshot };
      }

      const db = getDb();
      const snaps = await db
        .select()
        .from(schema.snapshots)
        .where(
          and(
            eq(schema.snapshots.id, input.snapshotId),
            eq(schema.snapshots.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (snaps.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Snapshot not found" });
      }

      // Note: Full restoration would recreate folders and files
      // For now, we return the manifest for the client to process
      return {
        success: true,
        snapshot: snaps[0],
      };
    }),

  delete: publicQuery
    .input(z.object({ snapshotId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        deleteLocalSnapshot(ctx.user.id, input.snapshotId);
        return { success: true };
      }

      const db = getDb();
      await db
        .delete(schema.snapshots)
        .where(
          and(
            eq(schema.snapshots.id, input.snapshotId),
            eq(schema.snapshots.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),
});
