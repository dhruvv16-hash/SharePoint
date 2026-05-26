import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import * as schema from "@db/schema";
import {
  addLocalUploadChunk,
  cancelLocalUploadSession,
  completeLocalUploadSession,
  createLocalUploadSession,
  getLocalUploadSession,
  listLocalUploadSessions,
} from "../queries/local-content-store";

export const uploadRouter = createRouter({
  createSession: publicQuery
    .input(
      z.object({
        fileName: z.string().min(1),
        fileSize: z.number().positive(),
        mimeType: z.string().optional(),
        folderId: z.number().optional(),
        checksum: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const session = createLocalUploadSession(ctx.user.id, input);
        return {
          sessionId: session.id,
          chunkSize: session.chunkSize,
          totalChunks: session.totalChunks,
          status: session.status,
        };
      }

      const db = getDb();
      const chunkSize = 5242880; // 5MB
      const totalChunks = Math.ceil(input.fileSize / chunkSize);

      const result = await db.insert(schema.uploadSessions).values({
        userId: ctx.user.id,
        folderId: input.folderId || null,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType || "application/octet-stream",
        chunkSize,
        totalChunks,
        uploadedChunks: [],
        status: "pending",
        storagePath: `uploads/${ctx.user.id}/${Date.now()}_${input.fileName}`,
        checksum: input.checksum,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        sessionId: Number(result[0].insertId),
        chunkSize,
        totalChunks,
        status: "pending",
      };
    }),

  chunk: publicQuery
    .input(
      z.object({
        sessionId: z.number(),
        chunkIndex: z.number().min(0),
        data: z.string(), // base64 encoded chunk
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const session = addLocalUploadChunk(ctx.user.id, input.sessionId, input.chunkIndex, input.data);
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
        }

        return {
          chunkIndex: input.chunkIndex,
          uploadedChunks: session.uploadedChunks.length,
          totalChunks: session.totalChunks,
          status: session.status,
        };
      }

      const db = getDb();
      const session = await db
        .select()
        .from(schema.uploadSessions)
        .where(
          and(
            eq(schema.uploadSessions.id, input.sessionId),
            eq(schema.uploadSessions.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
      }

      const current = session[0];
      const uploaded = (current.uploadedChunks as number[]) || [];

      if (!uploaded.includes(input.chunkIndex)) {
        uploaded.push(input.chunkIndex);
      }

      const newStatus = uploaded.length >= current.totalChunks ? "processing" : "uploading";

      await db
        .update(schema.uploadSessions)
        .set({
          uploadedChunks: uploaded,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(schema.uploadSessions.id, input.sessionId));

      return {
        chunkIndex: input.chunkIndex,
        uploadedChunks: uploaded.length,
        totalChunks: current.totalChunks,
        status: newStatus,
      };
    }),

  status: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const session = getLocalUploadSession(ctx.user.id, input.sessionId);
        if (!session) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
        }

        return {
          sessionId: session.id,
          fileName: session.fileName,
          fileSize: session.fileSize,
          totalChunks: session.totalChunks,
          uploadedChunks: session.uploadedChunks.length,
          progress: Math.round((session.uploadedChunks.length / session.totalChunks) * 100),
          status: session.status,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        };
      }

      const db = getDb();
      const session = await db
        .select()
        .from(schema.uploadSessions)
        .where(
          and(
            eq(schema.uploadSessions.id, input.sessionId),
            eq(schema.uploadSessions.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
      }

      const s = session[0];
      const uploaded = (s.uploadedChunks as number[]) || [];

      return {
        sessionId: s.id,
        fileName: s.fileName,
        fileSize: s.fileSize,
        totalChunks: s.totalChunks,
        uploadedChunks: uploaded.length,
        progress: Math.round((uploaded.length / s.totalChunks) * 100),
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }),

  complete: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        const completed = completeLocalUploadSession(ctx.user.id, input.sessionId);
        if (!completed) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Not all chunks uploaded" });
        }

        return {
          success: true,
          fileId: completed.file.id,
          fileName: completed.file.name,
          size: completed.file.size,
        };
      }

      const db = getDb();
      const session = await db
        .select()
        .from(schema.uploadSessions)
        .where(
          and(
            eq(schema.uploadSessions.id, input.sessionId),
            eq(schema.uploadSessions.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (session.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload session not found" });
      }

      const s = session[0];
      const uploaded = (s.uploadedChunks as number[]) || [];

      if (uploaded.length < s.totalChunks) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not all chunks uploaded",
        });
      }

      // Create file record
      const fileResult = await db.insert(schema.files).values({
        userId: ctx.user.id,
        folderId: s.folderId,
        name: s.fileName,
        originalName: s.fileName,
        mimeType: s.mimeType,
        size: s.fileSize,
        storagePath: s.storagePath || `uploads/${ctx.user.id}/${Date.now()}_${s.fileName}`,
        storageClass: "hot",
        encryptionStatus: "encrypted",
        checksum: s.checksum,
        versionCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create initial version
      await db.insert(schema.fileVersions).values({
        fileId: Number(fileResult[0].insertId),
        versionNumber: 1,
        name: s.fileName,
        storagePath: s.storagePath || `uploads/${ctx.user.id}/${Date.now()}_${s.fileName}`,
        size: s.fileSize,
        checksum: s.checksum,
        comment: "Initial upload",
        createdBy: ctx.user.id,
        createdAt: new Date(),
      });

      // Update user storage
      await db
        .update(schema.users)
        .set({
          storageUsed: (ctx.user.storageUsed || 0) + s.fileSize,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, ctx.user.id));

      // Update session
      await db
        .update(schema.uploadSessions)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(schema.uploadSessions.id, input.sessionId));

      return {
        success: true,
        fileId: Number(fileResult[0].insertId),
        fileName: s.fileName,
        size: s.fileSize,
      };
    }),

  cancel: publicQuery
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      if (!process.env.DATABASE_URL) {
        cancelLocalUploadSession(ctx.user.id, input.sessionId);
        return { success: true };
      }

      const db = getDb();
      await db
        .update(schema.uploadSessions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(schema.uploadSessions.id, input.sessionId),
            eq(schema.uploadSessions.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  sessions: publicQuery.query(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    if (!process.env.DATABASE_URL) {
      return listLocalUploadSessions(ctx.user.id).map((session) => ({
        ...session,
        progress: Math.round((session.uploadedChunks.length / session.totalChunks) * 100),
      }));
    }

    const db = getDb();
    const sessions = await db
      .select()
      .from(schema.uploadSessions)
      .where(eq(schema.uploadSessions.userId, ctx.user.id))
      .orderBy(schema.uploadSessions.createdAt);

    return sessions.map((s) => ({
      ...s,
      uploadedChunks: (s.uploadedChunks as number[]) || [],
      progress: Math.round(
        (((s.uploadedChunks as number[]) || []).length / s.totalChunks) * 100
      ),
    }));
  }),
});
