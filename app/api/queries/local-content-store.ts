import crypto from "crypto";
import bcrypt from "bcryptjs";
import type {
  File as SchemaFile,
  FileVersion as SchemaFileVersion,
  Folder as SchemaFolder,
  RecoveryItem as SchemaRecoveryItem,
  Share as SchemaShare,
  Snapshot as SchemaSnapshot,
} from "@db/schema";
import { adjustLocalUserStorageUsed, getLocalUserById } from "./local-auth-store";

type LocalFolder = SchemaFolder;
type LocalFile = SchemaFile & { contentChunks?: string[] };
type LocalFileVersion = SchemaFileVersion;
type LocalRecoveryItem = SchemaRecoveryItem;
type LocalShare = SchemaShare;
type LocalSnapshot = SchemaSnapshot;

type LocalWorkspace = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  ownerId: number;
  storageQuota: number;
  storageUsed: number;
  createdAt: Date;
  updatedAt: Date;
};

type LocalWorkspaceMember = {
  id: number;
  workspaceId: number;
  userId: number;
  role: "owner" | "manager" | "editor" | "viewer" | "guest";
  invitedBy: number | null;
  joinedAt: Date;
};

type LocalWorkspaceActivity = {
  id: number;
  workspaceId: number;
  userId: number;
  action: string;
  resourceType: string;
  resourceId: number | null;
  resourceName: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  details: Record<string, unknown> | null;
  createdAt: Date | null;
};

type LocalUploadSession = {
  id: number;
  userId: number;
  folderId: number | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  chunks: string[];
  storagePath: string;
  checksum: string | null;
  status: "pending" | "uploading" | "processing" | "completed" | "failed" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

type LocalState = {
  folders: Map<number, LocalFolder>;
  files: Map<number, LocalFile>;
  versions: Map<number, LocalFileVersion[]>;
  uploads: Map<number, LocalUploadSession>;
  recoveryItems: Map<number, LocalRecoveryItem>;
  shares: Map<number, LocalShare>;
  snapshots: Map<number, LocalSnapshot>;
  workspaces: Map<number, LocalWorkspace>;
  workspaceMembers: Map<number, LocalWorkspaceMember[]>;
  workspaceActivities: Map<number, LocalWorkspaceActivity[]>;
  nextFolderId: number;
  nextFileId: number;
  nextVersionId: number;
  nextUploadId: number;
  nextRecoveryId: number;
  nextShareId: number;
  nextSnapshotId: number;
  nextWorkspaceId: number;
  nextWorkspaceMemberId: number;
  nextWorkspaceActivityId: number;
};

const state: LocalState = {
  folders: new Map(),
  files: new Map(),
  versions: new Map(),
  uploads: new Map(),
  recoveryItems: new Map(),
  shares: new Map(),
  snapshots: new Map(),
  workspaces: new Map(),
  workspaceMembers: new Map(),
  workspaceActivities: new Map(),
  nextFolderId: 1,
  nextFileId: 1,
  nextVersionId: 1,
  nextUploadId: 1,
  nextRecoveryId: 1,
  nextShareId: 1,
  nextSnapshotId: 1,
  nextWorkspaceId: 1,
  nextWorkspaceMemberId: 1,
  nextWorkspaceActivityId: 1,
};

function now() {
  return new Date();
}

function cloneArray<T>(items: T[]) {
  return [...items];
}

function isDeletedFolder(folder: LocalFolder) {
  return !!folder.isDeleted;
}

function isDeletedFile(file: LocalFile) {
  return !!file.isDeleted;
}

function makeFolderPath(parentId: number | null, name: string) {
  if (!parentId) {
    return name;
  }

  const parent = state.folders.get(parentId);
  if (!parent) {
    return name;
  }

  return `${parent.path}/${name}`;
}

function updateFolderDescendantsPath(folderId: number, oldPath: string, newPath: string) {
  for (const folder of state.folders.values()) {
    if (folder.parentId === folderId || folder.path.startsWith(`${oldPath}/`)) {
      const updatedPath = folder.path === oldPath
        ? newPath
        : folder.path.replace(oldPath, newPath);
      state.folders.set(folder.id, { ...folder, path: updatedPath, updatedAt: now() });
      updateFolderDescendantsPath(folder.id, folder.path, updatedPath);
    }
  }
}

function removeFolderTree(folderId: number) {
  for (const file of state.files.values()) {
    if (file.folderId === folderId) {
      state.files.set(file.id, { ...file, isDeleted: true, deletedAt: now(), expiresAt: now() });
    }
  }

  for (const child of state.folders.values()) {
    if (child.parentId === folderId) {
      removeFolderTree(child.id);
      state.folders.set(child.id, { ...child, isDeleted: true, deletedAt: now() });
    }
  }
}

function restoreFolderTree(folderId: number) {
  for (const file of state.files.values()) {
    if (file.folderId === folderId) {
      state.files.set(file.id, { ...file, isDeleted: false, deletedAt: null, expiresAt: null });
    }
  }

  for (const child of state.folders.values()) {
    if (child.parentId === folderId) {
      restoreFolderTree(child.id);
      state.folders.set(child.id, { ...child, isDeleted: false, deletedAt: null });
    }
  }
}

function createRecoveryItemFromFile(file: LocalFile) {
  const recoveryItem: LocalRecoveryItem = {
    id: state.nextRecoveryId++,
    userId: file.userId,
    originalId: file.id,
    resourceType: "file",
    name: file.name,
    storagePath: file.storagePath,
    originalFolderId: file.folderId,
    originalPath: null,
    size: file.size || 0,
    metadata: file.metadata ?? null,
    deletedAt: now(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
    restoredAt: null,
  };
  state.recoveryItems.set(recoveryItem.id, recoveryItem);
}

function createRecoveryItemFromFolder(folder: LocalFolder) {
  const recoveryItem: LocalRecoveryItem = {
    id: state.nextRecoveryId++,
    userId: folder.userId,
    originalId: folder.id,
    resourceType: "folder",
    name: folder.name,
    storagePath: null,
    originalFolderId: folder.parentId,
    originalPath: folder.path,
    size: 0,
    metadata: null,
    deletedAt: now(),
    expiresAt: new Date(Date.now() + 30 * 86400000),
    restoredAt: null,
  };
  state.recoveryItems.set(recoveryItem.id, recoveryItem);
}

function pushWorkspaceActivity(workspaceId: number, userId: number, action: string, detail: string) {
  const activity: LocalWorkspaceActivity = {
    id: state.nextWorkspaceActivityId++,
    workspaceId,
    userId,
    action,
    resourceType: "workspace",
    resourceId: workspaceId,
    resourceName: null,
    actorName: null,
    actorAvatar: null,
    details: { message: detail },
    createdAt: now(),
  };
  const existing = state.workspaceActivities.get(workspaceId) || [];
  existing.unshift(activity);
  state.workspaceActivities.set(workspaceId, existing);
  return activity;
}

function getWorkspaceMembers(workspaceId: number) {
  return state.workspaceMembers.get(workspaceId) || [];
}

function setWorkspaceMembers(workspaceId: number, members: LocalWorkspaceMember[]) {
  state.workspaceMembers.set(workspaceId, members);
}

export function createLocalWorkspace(ownerId: number, input: { name: string; slug: string; description?: string; storageQuota?: number }) {
  const workspace: LocalWorkspace = {
    id: state.nextWorkspaceId++,
    name: input.name,
    slug: input.slug,
    description: input.description || null,
    ownerId,
    storageQuota: input.storageQuota || 1099511627776,
    storageUsed: 0,
    createdAt: now(),
    updatedAt: now(),
  };

  state.workspaces.set(workspace.id, workspace);
  setWorkspaceMembers(workspace.id, [{
    id: state.nextWorkspaceMemberId++,
    workspaceId: workspace.id,
    userId: ownerId,
    role: "owner",
    invitedBy: null,
    joinedAt: now(),
  }]);
  pushWorkspaceActivity(workspace.id, ownerId, "workspace.created", `Created workspace ${workspace.name}`);
  return workspace;
}

export function findLocalWorkspaceBySlug(slug: string) {
  return Array.from(state.workspaces.values()).find((workspace) => workspace.slug === slug) ?? null;
}

export function listLocalWorkspaces(userId: number) {
  const owned = Array.from(state.workspaces.values()).filter((workspace) => workspace.ownerId === userId);
  const member = Array.from(state.workspaces.values()).filter((workspace) =>
    getWorkspaceMembers(workspace.id).some((m) => m.userId === userId && m.role !== "owner")
  ).map((workspace) => ({
    ...workspace,
    memberRole: getWorkspaceMembers(workspace.id).find((m) => m.userId === userId)?.role || "viewer",
  }));

  return { owned, member };
}

export function listLocalWorkspaceMembers(workspaceId: number) {
  return getWorkspaceMembers(workspaceId).map((member) => ({
    ...member,
    user: getLocalUserById(member.userId),
  }));
}

export function listLocalWorkspaceActivity(workspaceId: number | null, userId: number, limit = 50) {
  const activities = workspaceId
    ? (state.workspaceActivities.get(workspaceId) || [])
    : Array.from(state.workspaceActivities.values()).flat();
  return activities
    .filter((activity) => {
      if (workspaceId) return activity.workspaceId === workspaceId;
      return activity.userId === userId;
    })
    .slice(0, limit);
}

export function renameLocalWorkspace(workspaceId: number, name: string, slug?: string, description?: string) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  const updated = {
    ...workspace,
    name,
    slug: slug || workspace.slug,
    description: description ?? workspace.description,
    updatedAt: now(),
  };
  state.workspaces.set(workspaceId, updated);
  pushWorkspaceActivity(workspaceId, workspace.ownerId, "workspace.renamed", `Renamed to ${name}`);
  return updated;
}

export function transferLocalWorkspaceOwnership(workspaceId: number, newOwnerId: number, actorId: number) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  const members = getWorkspaceMembers(workspaceId);
  const target = members.find((member) => member.userId === newOwnerId);
  if (!target) return null;

  const updatedMembers = members.map((member) => ({
    ...member,
    role: member.userId === newOwnerId ? "owner" as const : member.userId === workspace.ownerId ? "viewer" as const : member.role,
  }));
  setWorkspaceMembers(workspaceId, updatedMembers);

  const updated = { ...workspace, ownerId: newOwnerId, updatedAt: now() };
  state.workspaces.set(workspaceId, updated);
  pushWorkspaceActivity(workspaceId, actorId, "workspace.transfer", `Transferred ownership to user #${newOwnerId}`);
  return updated;
}

export function addLocalWorkspaceMember(workspaceId: number, userId: number, role: LocalWorkspaceMember["role"], invitedBy: number | null) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  const members = getWorkspaceMembers(workspaceId);
  const existing = members.find((member) => member.userId === userId);
  if (existing) return existing;
  const member: LocalWorkspaceMember = {
    id: state.nextWorkspaceMemberId++,
    workspaceId,
    userId,
    role,
    invitedBy,
    joinedAt: now(),
  };
  members.push(member);
  setWorkspaceMembers(workspaceId, members);
  pushWorkspaceActivity(workspaceId, invitedBy ?? userId, "workspace.member_added", `Added user #${userId} as ${role}`);
  return member;
}

export function updateLocalWorkspaceMemberRole(workspaceId: number, userId: number, role: LocalWorkspaceMember["role"], actorId: number) {
  const members = getWorkspaceMembers(workspaceId);
  const member = members.find((entry) => entry.userId === userId);
  if (!member) return null;
  member.role = role;
  setWorkspaceMembers(workspaceId, members);
  pushWorkspaceActivity(workspaceId, actorId, "workspace.member_role", `Changed user #${userId} to ${role}`);
  return member;
}

export function removeLocalWorkspaceMember(workspaceId: number, userId: number, actorId: number) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  const members = getWorkspaceMembers(workspaceId);
  const next = members.filter((member) => member.userId !== userId);
  setWorkspaceMembers(workspaceId, next);
  pushWorkspaceActivity(workspaceId, actorId, "workspace.member_removed", `Removed user #${userId}`);
  return true;
}

export function leaveLocalWorkspace(workspaceId: number, userId: number) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  if (workspace.ownerId === userId) return null;
  return removeLocalWorkspaceMember(workspaceId, userId, userId);
}

export function listLocalWorkspaceDetails(workspaceId: number) {
  const workspace = state.workspaces.get(workspaceId);
  if (!workspace) return null;
  return {
    ...workspace,
    members: listLocalWorkspaceMembers(workspaceId),
    activity: listLocalWorkspaceActivity(workspaceId, workspace.ownerId),
  };
}

export function createLocalFolder(userId: number, input: {
  name: string;
  parentId?: number;
  color?: string;
  icon?: string;
}) {
  const folder: LocalFolder = {
    id: state.nextFolderId++,
    userId,
    workspaceId: null,
    name: input.name,
    parentId: input.parentId ?? null,
    path: makeFolderPath(input.parentId ?? null, input.name),
    color: input.color ?? "#000000",
    icon: input.icon ?? "folder",
    isSystem: false,
    isDeleted: false,
    deletedAt: null,
    metadata: null,
    createdAt: now(),
    updatedAt: now(),
  } as LocalFolder;

  state.folders.set(folder.id, folder);
  return folder;
}

export function listLocalVault(userId: number, folderId?: number, showDeleted = false) {
  const folders = Array.from(state.folders.values()).filter((folder) => {
    if (folder.userId !== userId) return false;
    if (showDeleted ? !isDeletedFolder(folder) : isDeletedFolder(folder)) return false;
    return folderId ? folder.parentId === folderId : folder.parentId === null;
  });

  const files = Array.from(state.files.values()).filter((file) => {
    if (file.userId !== userId) return false;
    if (showDeleted ? !isDeletedFile(file) : isDeletedFile(file)) return false;
    return folderId ? file.folderId === folderId : file.folderId === null;
  });

  return { folders, files };
}

export function listLocalFolders(userId: number, showDeleted = false) {
  return Array.from(state.folders.values()).filter((folder) =>
    folder.userId === userId && (showDeleted ? !!folder.isDeleted : !folder.isDeleted)
  );
}

export function listLocalFiles(userId: number, showDeleted = false) {
  return Array.from(state.files.values()).filter((file) =>
    file.userId === userId && (showDeleted ? !!file.isDeleted : !file.isDeleted)
  );
}

export function getLocalBreadcrumbs(userId: number, folderId: number) {
  const crumbs: LocalFolder[] = [];
  let currentId: number | null = folderId;

  while (currentId) {
    const folder = state.folders.get(currentId);
    if (!folder || folder.userId !== userId) break;
    crumbs.unshift(folder);
    currentId = folder.parentId;
  }

  return crumbs;
}

export function getLocalFolder(userId: number, folderId: number) {
  const folder = state.folders.get(folderId);
  if (!folder || folder.userId !== userId) {
    return null;
  }
  return folder;
}

export function renameLocalResource(userId: number, type: "file" | "folder", id: number, name: string) {
  if (type === "file") {
    const file = state.files.get(id);
    if (file && file.userId === userId) {
      state.files.set(id, { ...file, name, originalName: name, updatedAt: now() });
    }
    return;
  }

  const folder = state.folders.get(id);
  if (!folder || folder.userId !== userId) return;

  const oldPath = folder.path;
  const newPath = makeFolderPath(folder.parentId, name);
  state.folders.set(id, { ...folder, name, path: newPath, updatedAt: now() });
  updateFolderDescendantsPath(id, oldPath, newPath);
}

export function moveLocalResource(userId: number, type: "file" | "folder", ids: number[], targetFolderId: number | null) {
  if (type === "file") {
    for (const id of ids) {
      const file = state.files.get(id);
      if (file && file.userId === userId) {
        state.files.set(id, { ...file, folderId: targetFolderId, updatedAt: now() });
      }
    }
    return;
  }

  for (const id of ids) {
    const folder = state.folders.get(id);
    if (!folder || folder.userId !== userId) continue;
    const oldPath = folder.path;
    const newPath = makeFolderPath(targetFolderId, folder.name);
    state.folders.set(id, { ...folder, parentId: targetFolderId, path: newPath, updatedAt: now() });
    updateFolderDescendantsPath(id, oldPath, newPath);
  }
}

export function deleteLocalResource(userId: number, type: "file" | "folder", ids: number[], permanent: boolean) {
  for (const id of ids) {
    if (type === "file") {
      const file = state.files.get(id);
      if (!file || file.userId !== userId) continue;

      if (permanent) {
        state.files.delete(id);
        state.versions.delete(id);
      } else {
        createRecoveryItemFromFile(file);
        state.files.set(id, { ...file, isDeleted: true, deletedAt: now(), expiresAt: new Date(Date.now() + 30 * 86400000) });
      }
      continue;
    }

    const folder = state.folders.get(id);
    if (!folder || folder.userId !== userId) continue;

    if (permanent) {
      removeFolderTree(id);
      state.folders.delete(id);
    } else {
      createRecoveryItemFromFolder(folder);
      removeFolderTree(id);
      state.folders.set(id, { ...folder, isDeleted: true, deletedAt: now() });
    }
  }
}

export function restoreLocalResource(userId: number, type: "file" | "folder", ids: number[]) {
  for (const id of ids) {
    if (type === "file") {
      const file = state.files.get(id);
      if (file && file.userId === userId) {
        state.files.set(id, { ...file, isDeleted: false, deletedAt: null, expiresAt: null });
      }
      for (const item of state.recoveryItems.values()) {
        if (item.userId === userId && item.originalId === id && item.resourceType === "file") {
          state.recoveryItems.set(item.id, { ...item, restoredAt: now() });
        }
      }
      continue;
    }

    const folder = state.folders.get(id);
    if (folder && folder.userId === userId) {
      state.folders.set(id, { ...folder, isDeleted: false, deletedAt: null });
      restoreFolderTree(id);
    }
    for (const item of state.recoveryItems.values()) {
      if (item.userId === userId && item.originalId === id && item.resourceType === "folder") {
        state.recoveryItems.set(item.id, { ...item, restoredAt: now() });
      }
    }
  }
}

export function getLocalVaultStats(userId: number) {
  const files = Array.from(state.files.values()).filter((file) => file.userId === userId && !file.isDeleted);
  const folders = Array.from(state.folders.values()).filter((folder) => folder.userId === userId && !folder.isDeleted);
  const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);

  return {
    fileCount: files.length,
    folderCount: folders.length,
    totalSize,
  };
}

export function createLocalUploadSession(userId: number, input: {
  fileName: string;
  fileSize: number;
  mimeType?: string;
  folderId?: number;
  checksum?: string;
}) {
  const chunkSize = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(input.fileSize / chunkSize);
  const session: LocalUploadSession = {
    id: state.nextUploadId++,
    userId,
    folderId: input.folderId ?? null,
    fileName: input.fileName,
    fileSize: input.fileSize,
    mimeType: input.mimeType ?? "application/octet-stream",
    chunkSize,
    totalChunks,
    uploadedChunks: [],
    chunks: [],
    storagePath: `uploads/local/${userId}/${Date.now()}_${input.fileName}`,
    checksum: input.checksum ?? null,
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
  };

  state.uploads.set(session.id, session);
  return session;
}

export function addLocalUploadChunk(userId: number, sessionId: number, chunkIndex: number, data: string) {
  const session = state.uploads.get(sessionId);
  if (!session || session.userId !== userId) {
    return null;
  }

  if (!session.uploadedChunks.includes(chunkIndex)) {
    session.uploadedChunks.push(chunkIndex);
    session.chunks[chunkIndex] = data;
  }

  session.status = session.uploadedChunks.length >= session.totalChunks ? "processing" : "uploading";
  session.updatedAt = now();
  state.uploads.set(sessionId, session);
  return session;
}

export function getLocalUploadSession(userId: number, sessionId: number) {
  const session = state.uploads.get(sessionId);
  if (!session || session.userId !== userId) {
    return null;
  }
  return session;
}

export function listLocalUploadSessions(userId: number) {
  return Array.from(state.uploads.values()).filter((session) => session.userId === userId);
}

export function completeLocalUploadSession(userId: number, sessionId: number) {
  const session = state.uploads.get(sessionId);
  if (!session || session.userId !== userId) {
    return null;
  }

  if (session.uploadedChunks.length < session.totalChunks) {
    return null;
  }

  const file: LocalFile = {
    id: state.nextFileId++,
    userId,
    workspaceId: null,
    folderId: session.folderId,
    name: session.fileName,
    originalName: session.fileName,
    mimeType: session.mimeType,
    size: session.fileSize,
    storagePath: session.storagePath,
    storageClass: "hot",
    encryptionStatus: "encrypted",
    checksum: session.checksum ?? null,
    versionCount: 1,
    isDeleted: false,
    deletedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: now(),
    updatedAt: now(),
    contentChunks: cloneArray(session.chunks),
  } as LocalFile;

  state.files.set(file.id, file);

  const version: LocalFileVersion = {
    id: state.nextVersionId++,
    fileId: file.id,
    versionNumber: 1,
    name: file.name,
    storagePath: file.storagePath,
    size: file.size,
    checksum: file.checksum,
    comment: "Initial upload",
    createdBy: userId,
    createdAt: now(),
  } as LocalFileVersion;

  state.versions.set(file.id, [version]);
  adjustLocalUserStorageUsed(userId, session.fileSize);

  session.status = "completed";
  session.completedAt = now();
  session.updatedAt = now();
  state.uploads.set(sessionId, session);

  return { file, version, session };
}

export function cancelLocalUploadSession(userId: number, sessionId: number) {
  const session = state.uploads.get(sessionId);
  if (!session || session.userId !== userId) return null;
  session.status = "cancelled";
  session.updatedAt = now();
  state.uploads.set(sessionId, session);
  return session;
}

export function getLocalFile(userId: number, fileId: number) {
  const file = state.files.get(fileId);
  if (!file || file.userId !== userId) return null;
  return file;
}

export function listLocalVersions(userId: number, fileId: number) {
  const file = getLocalFile(userId, fileId);
  if (!file) return [];
  return cloneArray((state.versions.get(fileId) ?? []).sort((a, b) => b.versionNumber - a.versionNumber));
}

export function createLocalVersion(userId: number, fileId: number, comment?: string) {
  const file = getLocalFile(userId, fileId);
  if (!file) return null;

  const versions = state.versions.get(fileId) ?? [];
  const nextVersionNumber = (versions.at(-1)?.versionNumber ?? 0) + 1;
  const version: LocalFileVersion = {
    id: state.nextVersionId++,
    fileId,
    versionNumber: nextVersionNumber,
    name: file.name,
    storagePath: file.storagePath,
    size: file.size,
    checksum: file.checksum,
    comment: comment || `Version ${nextVersionNumber}`,
    createdBy: userId,
    createdAt: now(),
  } as LocalFileVersion;

  state.versions.set(fileId, [...versions, version]);
  state.files.set(fileId, { ...file, versionCount: nextVersionNumber, updatedAt: now() });
  return version;
}

export function restoreLocalVersion(userId: number, fileId: number, versionId: number) {
  const file = getLocalFile(userId, fileId);
  if (!file) return null;
  const version = (state.versions.get(fileId) ?? []).find((v) => v.id === versionId);
  if (!version) return null;

  state.files.set(fileId, {
    ...file,
    storagePath: version.storagePath,
    size: version.size,
    checksum: version.checksum,
    updatedAt: now(),
  });
  return version;
}

export function deleteLocalVersion(userId: number, versionId: number) {
  for (const [fileId, versions] of state.versions.entries()) {
    const file = getLocalFile(userId, fileId);
    if (!file) continue;
    const next = versions.filter((version) => version.id !== versionId);
    if (next.length !== versions.length) {
      state.versions.set(fileId, next);
      return true;
    }
  }
  return false;
}

function makeShareToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function createLocalShare(userId: number, input: {
  fileId?: number;
  folderId?: number;
  shareType: LocalShare["shareType"];
  password?: string;
  permissions: LocalShare["permissions"];
  maxDownloads?: number;
  expiresIn?: number;
  requireAuth: boolean;
  passwordHash?: string | null;
}) {
  const share: LocalShare = {
    id: state.nextShareId++,
    userId,
    fileId: input.fileId ?? null,
    folderId: input.folderId ?? null,
    token: makeShareToken(),
    shareType: input.shareType,
    passwordHash: input.passwordHash ?? null,
    permissions: input.permissions,
    maxDownloads: input.maxDownloads ?? null,
    downloadCount: 0,
    expiresAt: input.expiresIn ? new Date(Date.now() + input.expiresIn * 3600000) : null,
    isActive: true,
    requireAuth: input.requireAuth,
    allowedDomains: null,
    createdAt: now(),
    updatedAt: now(),
  } as LocalShare;

  state.shares.set(share.id, share);
  return share;
}

export function listLocalShares(userId: number) {
  return Array.from(state.shares.values()).filter((share) => share.userId === userId);
}

export function getLocalShareByToken(token: string) {
  return Array.from(state.shares.values()).find((share) => share.token === token) ?? null;
}

export function revokeLocalShare(userId: number, shareId: number) {
  const share = state.shares.get(shareId);
  if (!share || share.userId !== userId) return null;
  const updated = { ...share, isActive: false, updatedAt: now() };
  state.shares.set(shareId, updated);
  return updated;
}

export function verifyLocalSharePassword(token: string, password: string) {
  const share = getLocalShareByToken(token);
  if (!share) return { share: null, valid: false };
  if (!share.passwordHash) return { share, valid: true };
  return { share, valid: bcrypt.compareSync(password, share.passwordHash) };
}

export function logLocalShareDownload(token: string) {
  const share = getLocalShareByToken(token);
  if (!share) return null;
  const updated = { ...share, downloadCount: (share.downloadCount || 0) + 1, updatedAt: now() };
  state.shares.set(updated.id, updated);
  return updated;
}

export function createLocalSnapshot(userId: number, input: { name: string; snapshotType: LocalSnapshot["snapshotType"] }) {
  const folders = Array.from(state.folders.values()).filter((folder) => folder.userId === userId && !folder.isDeleted);
  const files = Array.from(state.files.values()).filter((file) => file.userId === userId && !file.isDeleted);
  const size = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const snapshot: LocalSnapshot = {
    id: state.nextSnapshotId++,
    userId,
    workspaceId: null,
    name: input.name,
    snapshotType: input.snapshotType,
    folderTree: folders.reduce((acc, folder) => {
      acc[String(folder.id)] = folder;
      return acc;
    }, {} as Record<string, unknown>),
    fileManifest: files.map((file) => ({
      id: file.id,
      name: file.name,
      folderId: file.folderId,
      storagePath: file.storagePath,
      size: file.size,
      mimeType: file.mimeType,
      checksum: file.checksum,
    })) as unknown as Record<string, unknown>[],
    size,
    createdAt: now(),
  } as LocalSnapshot;

  state.snapshots.set(snapshot.id, snapshot);
  return snapshot;
}

export function listLocalSnapshots(userId: number) {
  return Array.from(state.snapshots.values()).filter((snapshot) => snapshot.userId === userId);
}

export function getLocalSnapshot(userId: number, snapshotId: number) {
  const snapshot = state.snapshots.get(snapshotId);
  if (!snapshot || snapshot.userId !== userId) return null;
  return snapshot;
}

export function deleteLocalSnapshot(userId: number, snapshotId: number) {
  const snapshot = getLocalSnapshot(userId, snapshotId);
  if (!snapshot) return false;
  state.snapshots.delete(snapshotId);
  return true;
}

export function listLocalRecoveryItems(userId: number) {
  return Array.from(state.recoveryItems.values()).filter((item) => item.userId === userId && !item.restoredAt);
}

export function restoreLocalRecoveryItem(userId: number, recoveryItemId: number) {
  const item = state.recoveryItems.get(recoveryItemId);
  if (!item || item.userId !== userId) return null;

  if (item.resourceType === "file") {
    const file = state.files.get(item.originalId);
    if (file) {
      state.files.set(file.id, { ...file, isDeleted: false, deletedAt: null, expiresAt: null });
    }
  } else {
    const folder = state.folders.get(item.originalId);
    if (folder) {
      state.folders.set(folder.id, { ...folder, isDeleted: false, deletedAt: null });
      restoreFolderTree(folder.id);
    }
  }

  const updated = { ...item, restoredAt: now() };
  state.recoveryItems.set(item.id, updated);
  return updated;
}

export function permanentDeleteLocalRecoveryItem(userId: number, recoveryItemId: number) {
  const item = state.recoveryItems.get(recoveryItemId);
  if (!item || item.userId !== userId) return null;
  state.recoveryItems.delete(recoveryItemId);
  if (item.resourceType === "file") {
    state.files.delete(item.originalId);
    state.versions.delete(item.originalId);
  } else {
    state.folders.delete(item.originalId);
  }
  return item;
}

export function emptyLocalTrash(userId: number) {
  const items = listLocalRecoveryItems(userId);
  for (const item of items) {
    if (item.resourceType === "file") {
      state.files.delete(item.originalId);
      state.versions.delete(item.originalId);
    } else {
      state.folders.delete(item.originalId);
    }
    state.recoveryItems.delete(item.id);
  }
  return items.length;
}

export function setLocalRecoveryRetention(userId: number, days: string) {
  const items = listLocalRecoveryItems(userId);
  const expiresAt = days === "forever" ? new Date("2099-12-31") : new Date(Date.now() + parseInt(days, 10) * 86400000);
  for (const item of items) {
    state.recoveryItems.set(item.id, { ...item, expiresAt });
  }
  return items.length;
}

export function searchLocalContent(userId: number, q: string) {
  const pattern = q.toLowerCase();
  const files = Array.from(state.files.values()).filter((file) =>
    file.userId === userId && !file.isDeleted && (
      file.name.toLowerCase().includes(pattern) ||
      file.originalName.toLowerCase().includes(pattern) ||
      (file.mimeType || "").toLowerCase().includes(pattern)
    )
  );

  const folders = Array.from(state.folders.values()).filter((folder) =>
    folder.userId === userId && !folder.isDeleted && (
      folder.name.toLowerCase().includes(pattern) ||
      folder.path.toLowerCase().includes(pattern)
    )
  );

  return { files, folders };
}
