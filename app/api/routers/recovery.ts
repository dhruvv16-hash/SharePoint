import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  emptyLocalTrash,
  listLocalRecoveryItems,
  permanentDeleteLocalRecoveryItem,
  restoreLocalRecoveryItem,
  setLocalRecoveryRetention,
} from "../queries/local-content-store";

export const recoveryRouter = createRouter({
  list: publicQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return listLocalRecoveryItems(ctx.user.id).slice((input.page - 1) * input.limit, input.page * input.limit);
      }

      const db = getDb();
      const offset = (input.page - 1) * input.limit;

      const items = await db
        .select()
        .from(schema.recoveryItems)
        .where(
          and(
            eq(schema.recoveryItems.userId, ctx.user.id),
            eq(schema.recoveryItems.restoredAt, null as unknown as Date)
          )
        )
        .orderBy(desc(schema.recoveryItems.deletedAt))
        .limit(input.limit)
        .offset(offset);

      return items;
    }),

  restore: publicQuery
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const item = restoreLocalRecoveryItem(ctx.user.id, input.id);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
        }
        return { success: true };
      }

      const db = getDb();
      const items = await db
        .select()
        .from(schema.recoveryItems)
        .where(eq(schema.recoveryItems.id, input.id))
        .limit(1);

      if (items.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }

      const item = items[0];

      if (item.resourceType === "file") {
        await db
          .update(schema.files)
          .set({
            isDeleted: false,
            deletedAt: null,
            expiresAt: null,
          })
          .where(eq(schema.files.id, item.originalId));
      } else {
        await db
          .update(schema.folders)
          .set({
            isDeleted: false,
            deletedAt: null,
          })
          .where(eq(schema.folders.id, item.originalId));
      }

      await db
        .update(schema.recoveryItems)
        .set({ restoredAt: new Date() })
        .where(eq(schema.recoveryItems.id, input.id));

      return { success: true };
    }),

  permanentDelete: publicQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        permanentDeleteLocalRecoveryItem(ctx.user.id, input.id);
        return { success: true };
      }

      const db = getDb();
      await db.delete(schema.recoveryItems).where(eq(schema.recoveryItems.id, input.id));

      return { success: true };
    }),

  emptyTrash: publicQuery.mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      const deletedCount = emptyLocalTrash(ctx.user.id);
      return { success: true, deletedCount };
    }

    const db = getDb();

    // Get all recovery items for user
    const items = await db
      .select()
      .from(schema.recoveryItems)
      .where(
        and(
          eq(schema.recoveryItems.userId, ctx.user.id),
          eq(schema.recoveryItems.restoredAt, null as unknown as Date)
        )
      );

    // Permanently delete files
    for (const item of items) {
      if (item.resourceType === "file") {
        await db.delete(schema.files).where(eq(schema.files.id, item.originalId));
      } else {
        await db.delete(schema.folders).where(eq(schema.folders.id, item.originalId));
      }
    }

    // Delete recovery items
    await db
      .delete(schema.recoveryItems)
      .where(eq(schema.recoveryItems.userId, ctx.user.id));

    return { success: true, deletedCount: items.length };
  }),

  setRetention: publicQuery
    .input(
      z.object({
        days: z.enum(["7", "30", "90", "forever"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        setLocalRecoveryRetention(ctx.user.id, input.days);
        return { success: true, retentionDays: input.days };
      }

      // Update all recovery items expiration
      const db = getDb();
      const items = await db
        .select()
        .from(schema.recoveryItems)
        .where(eq(schema.recoveryItems.userId, ctx.user.id));

      for (const item of items) {
        const expiresAt =
          input.days === "forever"
            ? new Date("2099-12-31")
            : new Date(Date.now() + parseInt(input.days) * 86400000);

        await db
          .update(schema.recoveryItems)
          .set({ expiresAt })
          .where(eq(schema.recoveryItems.id, item.id));
      }

      return { success: true, retentionDays: input.days };
    }),
});
