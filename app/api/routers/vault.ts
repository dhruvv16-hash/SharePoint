import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  createLocalFolder,
  deleteLocalResource,
  getLocalBreadcrumbs,
  getLocalVaultStats,
  listLocalFolders,
  listLocalVault,
  moveLocalResource,
  renameLocalResource,
  restoreLocalResource,
} from "../queries/local-content-store";

export const vaultRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        folderId: z.number().optional(),
        workspaceId: z.number().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
        showDeleted: z.boolean().default(false),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const { folders, files } = listLocalVault(ctx.user.id, input.folderId, input.showDeleted);
        return {
          folders,
          files,
          totalFolders: folders.length,
          totalFiles: files.length,
        };
      }

      const db = getDb();
      const offset = (input.page - 1) * input.limit;

      // Get folders
      const folderCondition = input.showDeleted
        ? and(
            eq(schema.folders.userId, ctx.user.id),
            input.folderId
              ? eq(schema.folders.parentId, input.folderId)
              : isNull(schema.folders.parentId),
            eq(schema.folders.isDeleted, true)
          )
        : and(
            eq(schema.folders.userId, ctx.user.id),
            input.folderId
              ? eq(schema.folders.parentId, input.folderId)
              : isNull(schema.folders.parentId),
            eq(schema.folders.isDeleted, false)
          );

      const folderList = await db
        .select()
        .from(schema.folders)
        .where(folderCondition)
        .limit(input.limit)
        .offset(offset);

      // Get files
      const fileCondition = input.showDeleted
        ? and(
            eq(schema.files.userId, ctx.user.id),
            input.folderId
              ? eq(schema.files.folderId, input.folderId)
              : isNull(schema.files.folderId),
            eq(schema.files.isDeleted, true)
          )
        : and(
            eq(schema.files.userId, ctx.user.id),
            input.folderId
              ? eq(schema.files.folderId, input.folderId)
              : isNull(schema.files.folderId),
            eq(schema.files.isDeleted, false)
          );

      const fileList = await db
        .select()
        .from(schema.files)
        .where(fileCondition)
        .limit(input.limit)
        .offset(offset)
        .orderBy(desc(schema.files.updatedAt));

      return {
        folders: folderList,
        files: fileList,
        totalFolders: folderList.length,
        totalFiles: fileList.length,
      };
    }),

  tree: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      const folders = listLocalFolders(ctx.user.id, false);
      type FolderType = (typeof folders)[number];
      type TreeNode = FolderType & { children: TreeNode[] };

      const buildTree = (parentId: number | null): TreeNode[] => {
        return folders
          .filter((folder) => folder.parentId === parentId)
          .map((folder) => ({
            ...folder,
            children: buildTree(folder.id),
          }));
      };

      return buildTree(null);
    }

    const db = getDb();
    const allFolders = await db
      .select()
      .from(schema.folders)
      .where(
        and(
          eq(schema.folders.userId, ctx.user.id),
          eq(schema.folders.isDeleted, false)
        )
      );

    type FolderType = (typeof allFolders)[number];
    type TreeNode = FolderType & { children: TreeNode[] };

    const buildTree = (parentId: number | null): TreeNode[] => {
      return allFolders
        .filter((f) => f.parentId === parentId)
        .map((f) => ({
          ...f,
          children: buildTree(f.id),
        }));
    };

    return buildTree(null);
  }),

  breadcrumbs: publicQuery
    .input(z.object({ folderId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return getLocalBreadcrumbs(ctx.user.id, input.folderId);
      }

      const db = getDb();
      const crumbs = [];
      let currentId: number | null = input.folderId;

      while (currentId) {
        const folder = await db
          .select()
          .from(schema.folders)
          .where(eq(schema.folders.id, currentId))
          .limit(1);

        if (folder.length === 0) break;
        crumbs.unshift(folder[0]);
        currentId = folder[0].parentId;
      }

      return crumbs;
    }),

  createFolder: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        parentId: z.number().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const folder = createLocalFolder(ctx.user.id, {
          name: input.name,
          parentId: input.parentId,
          color: input.color,
          icon: input.icon,
        });
        return { id: folder.id, name: folder.name, path: folder.path };
      }

      const db = getDb();

      // Build path
      let path = input.name;
      if (input.parentId) {
        const parent = await db
          .select()
          .from(schema.folders)
          .where(eq(schema.folders.id, input.parentId))
          .limit(1);
        if (parent.length > 0) {
          path = `${parent[0].path}/${input.name}`;
        }
      }

      const result = await db.insert(schema.folders).values({
        userId: ctx.user.id,
        name: input.name,
        parentId: input.parentId || null,
        path,
        color: input.color || "#000000",
        icon: input.icon || "folder",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return { id: Number(result[0].insertId), name: input.name, path };
    }),

  rename: publicQuery
    .input(
      z.object({
        id: z.number(),
        type: z.enum(["file", "folder"]),
        name: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        renameLocalResource(ctx.user.id, input.type, input.id, input.name);
        return { success: true };
      }

      const db = getDb();

      if (input.type === "folder") {
        await db
          .update(schema.folders)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(schema.folders.id, input.id));
      } else {
        await db
          .update(schema.files)
          .set({
            name: input.name,
            originalName: input.name,
            updatedAt: new Date(),
          })
          .where(eq(schema.files.id, input.id));
      }

      return { success: true };
    }),

  move: publicQuery
    .input(
      z.object({
        ids: z.array(z.number()),
        type: z.enum(["file", "folder"]),
        targetFolderId: z.number().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        moveLocalResource(ctx.user.id, input.type, input.ids, input.targetFolderId);
        return { success: true };
      }

      const db = getDb();

      if (input.type === "file") {
        for (const id of input.ids) {
          await db
            .update(schema.files)
            .set({ folderId: input.targetFolderId, updatedAt: new Date() })
            .where(eq(schema.files.id, id));
        }
      } else {
        for (const id of input.ids) {
          let newPath = "";
          if (input.targetFolderId) {
            const target = await db
              .select()
              .from(schema.folders)
              .where(eq(schema.folders.id, input.targetFolderId))
              .limit(1);
            if (target.length > 0) {
              const moved = await db
                .select()
                .from(schema.folders)
                .where(eq(schema.folders.id, id))
                .limit(1);
              newPath = `${target[0].path}/${moved[0]?.name || ""}`;
            }
          }
          await db
            .update(schema.folders)
            .set({
              parentId: input.targetFolderId,
              path: newPath || undefined,
              updatedAt: new Date(),
            })
            .where(eq(schema.folders.id, id));
        }
      }

      return { success: true };
    }),

  delete: publicQuery
    .input(
      z.object({
        ids: z.array(z.number()),
        type: z.enum(["file", "folder"]),
        permanent: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        deleteLocalResource(ctx.user.id, input.type, input.ids, input.permanent);
        return { success: true };
      }

      const db = getDb();
      const now = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 day retention

      if (input.type === "file") {
        for (const id of input.ids) {
          if (input.permanent) {
            await db.delete(schema.files).where(eq(schema.files.id, id));
          } else {
            // Get file info for recovery
            const file = await db
              .select()
              .from(schema.files)
              .where(eq(schema.files.id, id))
              .limit(1);

            if (file.length > 0) {
              // Create recovery item
              await db.insert(schema.recoveryItems).values({
                userId: ctx.user.id,
                originalId: id,
                resourceType: "file",
                name: file[0].name,
                storagePath: file[0].storagePath,
                originalFolderId: file[0].folderId,
                size: file[0].size,
                metadata: file[0].metadata,
                deletedAt: now,
                expiresAt,
              });
            }

            await db
              .update(schema.files)
              .set({ isDeleted: true, deletedAt: now, expiresAt })
              .where(eq(schema.files.id, id));
          }
        }
      } else {
        for (const id of input.ids) {
          if (input.permanent) {
            await db.delete(schema.folders).where(eq(schema.folders.id, id));
          } else {
            const folder = await db
              .select()
              .from(schema.folders)
              .where(eq(schema.folders.id, id))
              .limit(1);

            if (folder.length > 0) {
              await db.insert(schema.recoveryItems).values({
                userId: ctx.user.id,
                originalId: id,
                resourceType: "folder",
                name: folder[0].name,
                originalPath: folder[0].path,
                size: 0,
                deletedAt: now,
                expiresAt,
              });
            }

            await db
              .update(schema.folders)
              .set({ isDeleted: true, deletedAt: now })
              .where(eq(schema.folders.id, id));
          }
        }
      }

      return { success: true };
    }),

  restore: publicQuery
    .input(
      z.object({
        ids: z.array(z.number()),
        type: z.enum(["file", "folder"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        restoreLocalResource(ctx.user.id, input.type, input.ids);
        return { success: true };
      }

      const db = getDb();

      if (input.type === "file") {
        for (const id of input.ids) {
          await db
            .update(schema.files)
            .set({ isDeleted: false, deletedAt: null, expiresAt: null })
            .where(eq(schema.files.id, id));

          // Mark recovery item as restored
          await db
            .update(schema.recoveryItems)
            .set({ restoredAt: new Date() })
            .where(eq(schema.recoveryItems.originalId, id));
        }
      } else {
        for (const id of input.ids) {
          await db
            .update(schema.folders)
            .set({ isDeleted: false, deletedAt: null })
            .where(eq(schema.folders.id, id));

          await db
            .update(schema.recoveryItems)
            .set({ restoredAt: new Date() })
            .where(eq(schema.recoveryItems.originalId, id));
        }
      }

      return { success: true };
    }),

  stats: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      const stats = getLocalVaultStats(ctx.user.id);
      return {
        ...stats,
        storageQuota: ctx.user.storageQuota,
        storageUsed: ctx.user.storageUsed,
      };
    }

    const db = getDb();

    const fileCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.files)
      .where(
        and(eq(schema.files.userId, ctx.user.id), eq(schema.files.isDeleted, false))
      );

    const folderCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.folders)
      .where(
        and(eq(schema.folders.userId, ctx.user.id), eq(schema.folders.isDeleted, false))
      );

    const totalSize = await db
      .select({ size: sql<number>`COALESCE(sum(size), 0)` })
      .from(schema.files)
      .where(
        and(eq(schema.files.userId, ctx.user.id), eq(schema.files.isDeleted, false))
      );

    return {
      fileCount: fileCount[0]?.count || 0,
      folderCount: folderCount[0]?.count || 0,
      totalSize: totalSize[0]?.size || 0,
      storageQuota: ctx.user.storageQuota,
      storageUsed: ctx.user.storageUsed,
    };
  }),
});
