import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  timestamp,
  bigint,
  int,
  boolean,
  json,
} from "drizzle-orm/mysql-core";

// ─── Users ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  displayName: varchar("display_name", { length: 255 }),
  name: varchar("name", { length: 255 }),
  avatar: text("avatar"),
  passwordHash: varchar("password_hash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  plan: mysqlEnum("plan", ["free", "pro", "business", "enterprise"]).default("free"),
  storageUsed: bigint("storage_used", { mode: "number" }).default(0),
  storageQuota: bigint("storage_quota", { mode: "number" }).default(10737418240),
  encryptionMode: mysqlEnum("encryption_mode", ["standard", "zero_knowledge"]).default("standard"),
  publicKey: text("public_key"),
  privateKeyEncrypted: text("private_key_encrypted"),
  emailVerified: boolean("email_verified").default(false),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  trustedDevices: json("trusted_devices").$type<string[]>(),
  lastSignInAt: timestamp("last_sign_in_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Sessions ───
export const sessions = mysqlTable("sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  token: varchar("token", { length: 500 }).notNull(),
  refreshToken: varchar("refresh_token", { length: 500 }),
  deviceId: varchar("device_id", { length: 255 }),
  deviceName: varchar("device_name", { length: 255 }),
  deviceType: mysqlEnum("device_type", ["desktop", "mobile", "tablet", "unknown"]),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  isTrusted: boolean("is_trusted").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Session = typeof sessions.$inferSelect;

// ─── Workspaces ───
export const workspaces = mysqlTable("workspaces", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),
  ownerId: bigint("owner_id", { mode: "number", unsigned: true }).notNull(),
  storageQuota: bigint("storage_quota", { mode: "number" }).default(1099511627776),
  storageUsed: bigint("storage_used", { mode: "number" }).default(0),
  settings: json("settings").$type<{
    allowExternalShares: boolean;
    requireApproval: boolean;
    defaultPermissions: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;

// ─── Workspace Members ───
export const workspaceMembers = mysqlTable("workspace_members", {
  id: serial("id").primaryKey(),
  workspaceId: bigint("workspace_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  role: mysqlEnum("role", ["owner", "manager", "editor", "viewer", "guest"]).default("viewer"),
  invitedBy: bigint("invited_by", { mode: "number", unsigned: true }),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

// ─── Folders ───
export const folders = mysqlTable("folders", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  workspaceId: bigint("workspace_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: bigint("parent_id", { mode: "number", unsigned: true }),
  path: text("path").notNull(),
  color: varchar("color", { length: 7 }).default("#000000"),
  icon: varchar("icon", { length: 50 }).default("folder"),
  isSystem: boolean("is_system").default(false),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Folder = typeof folders.$inferSelect;

// ─── Files ───
export const files = mysqlTable("files", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  workspaceId: bigint("workspace_id", { mode: "number", unsigned: true }),
  folderId: bigint("folder_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 255 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  size: bigint("size", { mode: "number" }).default(0),
  storagePath: text("storage_path").notNull(),
  storageClass: mysqlEnum("storage_class", ["hot", "warm", "archive", "forever"]).default("hot"),
  encryptionStatus: mysqlEnum("encryption_status", ["unencrypted", "encrypted", "zero_knowledge"]).default("encrypted"),
  checksum: varchar("checksum", { length: 64 }),
  versionCount: int("version_count").default(1),
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  expiresAt: timestamp("expires_at"),
  metadata: json("metadata").$type<{
    width?: number;
    height?: number;
    duration?: number;
    pages?: number;
    tags?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type File = typeof files.$inferSelect;

// ─── File Versions ───
export const fileVersions = mysqlTable("file_versions", {
  id: serial("id").primaryKey(),
  fileId: bigint("file_id", { mode: "number", unsigned: true }).notNull(),
  versionNumber: int("version_number").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  storagePath: text("storage_path").notNull(),
  size: bigint("size", { mode: "number" }).default(0),
  checksum: varchar("checksum", { length: 64 }),
  comment: text("comment"),
  createdBy: bigint("created_by", { mode: "number", unsigned: true }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type FileVersion = typeof fileVersions.$inferSelect;

// ─── Upload Sessions ───
export const uploadSessions = mysqlTable("upload_sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  folderId: bigint("folder_id", { mode: "number", unsigned: true }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  chunkSize: int("chunk_size").default(5242880),
  totalChunks: int("total_chunks").notNull(),
  uploadedChunks: json("uploaded_chunks").$type<number[]>(),
  storagePath: text("storage_path"),
  checksum: varchar("checksum", { length: 64 }),
  status: mysqlEnum("status", ["pending", "uploading", "processing", "completed", "failed", "cancelled"]).default("pending"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export type UploadSession = typeof uploadSessions.$inferSelect;

// ─── Shares ───
export const shares = mysqlTable("shares", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  fileId: bigint("file_id", { mode: "number", unsigned: true }),
  folderId: bigint("folder_id", { mode: "number", unsigned: true }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  shareType: mysqlEnum("share_type", ["private", "password", "public", "team"]).default("private"),
  passwordHash: varchar("password_hash", { length: 255 }),
  permissions: mysqlEnum("permissions", ["read", "write", "upload", "admin"]).default("read"),
  maxDownloads: int("max_downloads"),
  downloadCount: int("download_count").default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
  requireAuth: boolean("require_auth").default(false),
  allowedDomains: json("allowed_domains").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Share = typeof shares.$inferSelect;

// ─── Snapshots ───
export const snapshots = mysqlTable("snapshots", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  workspaceId: bigint("workspace_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 255 }).notNull(),
  snapshotType: mysqlEnum("snapshot_type", ["daily", "weekly", "manual"]).default("manual"),
  folderTree: json("folder_tree").$type<Record<string, unknown>>(),
  fileManifest: json("file_manifest").$type<Record<string, unknown>[]>(),
  size: bigint("size", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Snapshot = typeof snapshots.$inferSelect;

// ─── Audit Logs ───
export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: bigint("resource_id", { mode: "number", unsigned: true }),
  details: json("details").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Recovery Items ───
export const recoveryItems = mysqlTable("recovery_items", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  originalId: bigint("original_id", { mode: "number", unsigned: true }).notNull(),
  resourceType: mysqlEnum("resource_type", ["file", "folder"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  storagePath: text("storage_path"),
  originalFolderId: bigint("original_folder_id", { mode: "number", unsigned: true }),
  originalPath: text("original_path"),
  size: bigint("size", { mode: "number" }).default(0),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  deletedAt: timestamp("deleted_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  restoredAt: timestamp("restored_at"),
});

export type RecoveryItem = typeof recoveryItems.$inferSelect;

// ─── Activity Feed ───
export const activityFeed = mysqlTable("activity_feed", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  workspaceId: bigint("workspace_id", { mode: "number", unsigned: true }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: bigint("resource_id", { mode: "number", unsigned: true }),
  resourceName: varchar("resource_name", { length: 255 }),
  actorName: varchar("actor_name", { length: 255 }),
  actorAvatar: text("actor_avatar"),
  details: json("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ActivityFeedItem = typeof activityFeed.$inferSelect;
