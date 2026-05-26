import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  addLocalWorkspaceMember,
  leaveLocalWorkspace,
  listLocalWorkspaceActivity,
  listLocalWorkspaceMembers,
  listLocalWorkspaces,
  removeLocalWorkspaceMember,
  renameLocalWorkspace,
  transferLocalWorkspaceOwnership,
  updateLocalWorkspaceMemberRole,
  createLocalWorkspace,
} from "../queries/local-content-store";
import { findLocalUserByUsernameOrEmail } from "../queries/local-auth-store";

export const workspaceRouter = createRouter({
  list: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalWorkspaces(ctx.user.id);
    }

    const db = getDb();

    // Get owned workspaces
    const owned = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.ownerId, ctx.user.id));

    // Get member workspaces
    const memberships = await db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, ctx.user.id));

    const memberWorkspaces = [];
    for (const m of memberships) {
      const ws = await db
        .select()
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, m.workspaceId))
        .limit(1);
      if (ws.length > 0) {
        memberWorkspaces.push({ ...ws[0], memberRole: m.role });
      }
    }

    return {
      owned,
      member: memberWorkspaces,
    };
  }),

  create: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100),
        description: z.string().optional(),
        storageQuota: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const workspace = createLocalWorkspace(ctx.user.id, input);
        return { workspaceId: workspace.id, slug: workspace.slug };
      }

      const db = getDb();

      const result = await db.insert(schema.workspaces).values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        ownerId: ctx.user.id,
        storageQuota: input.storageQuota || 1099511627776,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add owner as member
      await db.insert(schema.workspaceMembers).values({
        workspaceId: Number(result[0].insertId),
        userId: ctx.user.id,
        role: "owner",
        joinedAt: new Date(),
      });

      return { workspaceId: Number(result[0].insertId), slug: input.slug };
    }),

  members: publicQuery
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return listLocalWorkspaceMembers(input.workspaceId);
      }

      const db = getDb();
      const members = await db
        .select()
        .from(schema.workspaceMembers)
        .where(eq(schema.workspaceMembers.workspaceId, input.workspaceId));

      const result = [];
      for (const m of members) {
        const user = await db
          .select({
            id: schema.users.id,
            username: schema.users.username,
            displayName: schema.users.displayName,
            name: schema.users.name,
            email: schema.users.email,
            avatar: schema.users.avatar,
          })
          .from(schema.users)
          .where(eq(schema.users.id, m.userId))
          .limit(1);

        result.push({
          ...m,
          user: user[0] || null,
        });
      }

      return result;
    }),

  invite: publicQuery
    .input(
      z.object({
        workspaceId: z.number(),
        email: z.string().email(),
        role: z.enum(["manager", "editor", "viewer", "guest"]).default("viewer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const workspaceData = listLocalWorkspaces(ctx.user.id);
        const workspace = workspaceData.owned.find((entry) => entry.id === input.workspaceId) || workspaceData.member.find((entry) => entry.id === input.workspaceId);
        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
        }

        const invitedUser = findLocalUserByUsernameOrEmail(input.email);
        if (!invitedUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        const member = addLocalWorkspaceMember(input.workspaceId, invitedUser.id, input.role, ctx.user.id);
        if (!member) {
          throw new TRPCError({ code: "CONFLICT", message: "Could not add member" });
        }

        return { success: true, invitedUser: invitedUser.displayName || invitedUser.username };
      }

      const db = getDb();

      // Find user by email
      const user = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (user.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Check if already member
      const existing = await db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, input.workspaceId),
            eq(schema.workspaceMembers.userId, user[0].id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Already a member" });
      }

      await db.insert(schema.workspaceMembers).values({
        workspaceId: input.workspaceId,
        userId: user[0].id,
        role: input.role,
        invitedBy: ctx.user.id,
        joinedAt: new Date(),
      });

      return { success: true, invitedUser: user[0].displayName || user[0].username };
    }),

  updateMember: publicQuery
    .input(
      z.object({
        workspaceId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "editor", "viewer", "guest"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const updated = updateLocalWorkspaceMemberRole(input.workspaceId, input.userId, input.role, ctx.user.id);
        if (!updated) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        }
        return { success: true };
      }

      const db = getDb();
      await db
        .update(schema.workspaceMembers)
        .set({ role: input.role })
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, input.workspaceId),
            eq(schema.workspaceMembers.userId, input.userId)
          )
        );

      return { success: true };
    }),

  removeMember: publicQuery
    .input(
      z.object({
        workspaceId: z.number(),
        userId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const removed = removeLocalWorkspaceMember(input.workspaceId, input.userId, ctx.user.id);
        if (!removed) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
        }
        return { success: true };
      }

      const db = getDb();
      await db
        .delete(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, input.workspaceId),
            eq(schema.workspaceMembers.userId, input.userId)
          )
        );

      return { success: true };
    }),

  activity: publicQuery
    .input(
      z.object({
        workspaceId: z.number().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        return listLocalWorkspaceActivity(input.workspaceId ?? null, ctx.user.id, input.limit);
      }

      const db = getDb();
      const condition = input.workspaceId
        ? eq(schema.activityFeed.workspaceId, input.workspaceId)
        : eq(schema.activityFeed.userId, ctx.user.id);

      const activities = await db
        .select()
        .from(schema.activityFeed)
        .where(condition)
        .orderBy(desc(schema.activityFeed.createdAt))
        .limit(input.limit);

      return activities;
    }),

  rename: publicQuery
    .input(
      z.object({
        workspaceId: z.number(),
        name: z.string().min(1),
        slug: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const workspace = renameLocalWorkspace(input.workspaceId, input.name, input.slug, input.description);
        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
        }
        return { success: true };
      }

      return { success: true };
    }),

  transferOwnership: publicQuery
    .input(
      z.object({
        workspaceId: z.number(),
        newOwnerId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const workspace = transferLocalWorkspaceOwnership(input.workspaceId, input.newOwnerId, ctx.user.id);
        if (!workspace) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workspace or member not found" });
        }
        return { success: true };
      }

      return { success: true };
    }),

  leave: publicQuery
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const left = leaveLocalWorkspace(input.workspaceId, ctx.user.id);
        if (!left) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Owner cannot leave without transferring ownership" });
        }
        return { success: true };
      }

      return { success: true };
    }),
});
