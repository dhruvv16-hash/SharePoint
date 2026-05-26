import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { 
  addLocalWorkspaceMember,
  createLocalWorkspace,
  findLocalWorkspaceBySlug,
  listLocalWorkspaceMembers,
  removeLocalWorkspaceMember,
  transferLocalWorkspaceOwnership,
} from "../queries/local-content-store";
import {
  clearLocalSessions,
  findLocalUserByUsernameOrEmail,
  getLocalUserById,
  upsertLocalUser,
} from "../queries/local-auth-store";

export type WorkspaceFlowInput = {
  workspaceSlug?: string;
  workspaceName?: string;
  ownerEmail?: string;
  ownerUsername?: string;
  ownerDisplayName?: string;
  ownerPassword?: string;
  memberEmail?: string;
  memberUsername?: string;
  memberDisplayName?: string;
  memberPassword?: string;
};

export async function ensureLocalUser(input: {
  username: string;
  email: string;
  displayName: string;
  password: string;
}) {
  const existing = findLocalUserByUsernameOrEmail(input.username) ?? findLocalUserByUsernameOrEmail(input.email);
  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  return upsertLocalUser({
    username: input.username,
    email: input.email,
    displayName: input.displayName,
    name: input.displayName,
    role: "user",
    plan: "free",
    storageQuota: 10737418240,
    storageUsed: 0,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    unionId: `local_${input.username}`,
    passwordHash,
  });
}

export async function runWorkspaceFlow(input: WorkspaceFlowInput = {}) {
  const normalized = {
    workspaceSlug: input.workspaceSlug ?? "team-alpha",
    workspaceName: input.workspaceName ?? "Team Alpha",
    ownerEmail: input.ownerEmail ?? "owner1@example.com",
    ownerUsername: input.ownerUsername ?? "owner1",
    ownerDisplayName: input.ownerDisplayName ?? "Owner One",
    ownerPassword: input.ownerPassword ?? "Owner1Pass!",
    memberEmail: input.memberEmail ?? "member2@example.com",
    memberUsername: input.memberUsername ?? "member2",
    memberDisplayName: input.memberDisplayName ?? "Member Two",
    memberPassword: input.memberPassword ?? "Password123!",
  };

  const owner = await ensureLocalUser({
    username: normalized.ownerUsername,
    email: normalized.ownerEmail,
    displayName: normalized.ownerDisplayName,
    password: normalized.ownerPassword,
  });

  const member = await ensureLocalUser({
    username: normalized.memberUsername,
    email: normalized.memberEmail,
    displayName: normalized.memberDisplayName,
    password: normalized.memberPassword,
  });

  const workspace = findLocalWorkspaceBySlug(normalized.workspaceSlug) ?? createLocalWorkspace(owner.id, {
    name: normalized.workspaceName,
    slug: normalized.workspaceSlug,
    description: "Created by dev flow",
  });

  const invite = addLocalWorkspaceMember(workspace.id, member.id, "viewer", owner.id);
  const transfer = transferLocalWorkspaceOwnership(workspace.id, member.id, owner.id);
  if (!transfer) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Ownership transfer failed" });
  }

  const ownerRemoval = removeLocalWorkspaceMember(workspace.id, owner.id, member.id);
  if (!ownerRemoval) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Owner removal failed" });
  }

  const membersAfterTransfer = listLocalWorkspaceMembers(workspace.id);
  const logoutAll = clearLocalSessions(member.id);
  const memberAfterLogout = getLocalUserById(member.id);

  return {
    success: true,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: transfer.ownerId,
    },
    users: {
      owner: { id: owner.id, email: owner.email, username: owner.username },
      member: { id: member.id, email: member.email, username: member.username },
    },
    invite: {
      added: !!invite,
      memberCount: membersAfterTransfer.length,
    },
    transfer: {
      ownerId: transfer.ownerId,
    },
    removal: {
      removedOwner: !!ownerRemoval,
    },
    logoutAll: {
      success: logoutAll,
      trustedDevicesAfterLogout: memberAfterLogout?.trustedDevices ?? null,
    },
  };
}