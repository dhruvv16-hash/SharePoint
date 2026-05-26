import { z } from "zod";
import { eq, desc, sql, and } from "drizzle-orm";
import { createRouter, adminQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";

export const adminRouter = createRouter({
  stats: adminQuery.query(async () => {
    if (!process.env.DATABASE_URL) {
      return { users: 0, files: 0, totalStorage: 0, shares: 0, recoveryItems: 0 };
    }

    const db = getDb();

    const userCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users);

    const fileCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.files);

    const totalStorage = await db
      .select({ total: sql<number>`COALESCE(sum(size), 0)` })
      .from(schema.files);

    const shareCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.shares);

    const recoveryCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.recoveryItems);

    return {
      users: userCount[0]?.count || 0,
      files: fileCount[0]?.count || 0,
      totalStorage: totalStorage[0]?.total || 0,
      shares: shareCount[0]?.count || 0,
      recoveryItems: recoveryCount[0]?.count || 0,
    };
  }),

  users: adminQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        return [];
      }

      const db = getDb();
      const offset = (input.page - 1) * input.limit;

      let query = db.select().from(schema.users);

      if (input.search) {
        query = query.where(
          and(
            sql`${schema.users.username} LIKE ${`%${input.search}%`}`,
            sql`${schema.users.email} LIKE ${`%${input.search}%`}`
          )
        ) as typeof query;
      }

      const users = await query.limit(input.limit).offset(offset).orderBy(desc(schema.users.createdAt));

      return users;
    }),

  updateUser: adminQuery
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["user", "admin"]).optional(),
        plan: z.enum(["free", "pro", "business", "enterprise"]).optional(),
        storageQuota: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        return { success: true };
      }

      const db = getDb();

      const updates: Record<string, unknown> = {};
      if (input.role) updates.role = input.role;
      if (input.plan) updates.plan = input.plan;
      if (input.storageQuota) updates.storageQuota = input.storageQuota;

      await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, input.userId));

      return { success: true };
    }),

  auditLogs: adminQuery
    .input(
      z.object({
        page: z.number().default(1),
        limit: z.number().default(100),
        action: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      if (!process.env.DATABASE_URL) {
        return [];
      }

      const db = getDb();
      const offset = (input.page - 1) * input.limit;

      let condition = undefined;
      if (input.action) {
        condition = eq(schema.auditLogs.action, input.action);
      }

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(condition)
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(input.limit)
        .offset(offset);

      return logs;
    }),

  systemHealth: adminQuery.query(async () => {
    // Return mock system health data for now
    return {
      status: "healthy",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }),

  shares: adminQuery.query(async () => {
    if (!process.env.DATABASE_URL) {
      return [];
    }

    const db = getDb();
    const shares = await db
      .select()
      .from(schema.shares)
      .orderBy(desc(schema.shares.createdAt))
      .limit(100);

    return shares;
  }),
});
