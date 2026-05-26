import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, or, gte, lte } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import { searchLocalContent } from "../queries/local-content-store";

export const searchRouter = createRouter({
  query: publicQuery
    .input(
      z.object({
        q: z.string().default(""),
        type: z.enum(["all", "files", "folders"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const results = searchLocalContent(ctx.user.id, input.q);
        return {
          files: input.type === "folders" ? [] : results.files,
          folders: input.type === "files" ? [] : results.folders,
        };
      }

      const db = getDb();
      const offset = (input.page - 1) * input.limit;
      const searchPattern = `%${input.q}%`;

      const results: {
        files: (typeof schema.files.$inferSelect)[];
        folders: (typeof schema.folders.$inferSelect)[];
      } = { files: [], folders: [] };

      if (input.type === "all" || input.type === "files") {
        results.files = await db
          .select()
          .from(schema.files)
          .where(
            and(
              eq(schema.files.userId, ctx.user.id),
              eq(schema.files.isDeleted, false),
              or(
                like(schema.files.name, searchPattern),
                like(schema.files.originalName, searchPattern),
                like(schema.files.mimeType, searchPattern)
              )
            )
          )
          .limit(input.limit)
          .offset(offset);
      }

      if (input.type === "all" || input.type === "folders") {
        results.folders = await db
          .select()
          .from(schema.folders)
          .where(
            and(
              eq(schema.folders.userId, ctx.user.id),
              eq(schema.folders.isDeleted, false),
              or(
                like(schema.folders.name, searchPattern),
                like(schema.folders.path, searchPattern)
              )
            )
          )
          .limit(input.limit)
          .offset(offset);
      }

      return results;
    }),

  advanced: publicQuery
    .input(
      z.object({
        q: z.string().optional(),
        mimeType: z.string().optional(),
        minSize: z.number().optional(),
        maxSize: z.number().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        storageClass: z.enum(["hot", "warm", "archive", "forever"]).optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return { files: searchLocalContent(ctx.user.id, input.q ?? "").files };
      }

      const db = getDb();
      const conditions = [
        eq(schema.files.userId, ctx.user.id),
        eq(schema.files.isDeleted, false),
      ];

      if (input.q) {
        conditions.push(like(schema.files.name, `%${input.q}%`));
      }
      if (input.mimeType) {
        conditions.push(like(schema.files.mimeType, `%${input.mimeType}%`));
      }
      if (input.minSize) {
        conditions.push(gte(schema.files.size, input.minSize));
      }
      if (input.maxSize) {
        conditions.push(lte(schema.files.size, input.maxSize));
      }
      if (input.storageClass) {
        conditions.push(eq(schema.files.storageClass, input.storageClass));
      }

      const files = await db
        .select()
        .from(schema.files)
        .where(and(...conditions))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit);

      return { files };
    }),

  suggestions: publicQuery
    .input(z.object({ q: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return searchLocalContent(ctx.user.id, input.q).files.slice(0, 5).map((file) => file.name);
      }

      const db = getDb();
      const pattern = `%${input.q}%`;

      const recentFiles = await db
        .select({ name: schema.files.name })
        .from(schema.files)
        .where(
          and(
            eq(schema.files.userId, ctx.user.id),
            like(schema.files.name, pattern)
          )
        )
        .limit(5);

      return recentFiles.map((f) => f.name);
    }),
});
