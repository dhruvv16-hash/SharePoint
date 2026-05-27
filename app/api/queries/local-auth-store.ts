import crypto from "crypto";
import { nanoid } from "nanoid";
import type { InsertUser, User } from "@db/schema";

type LocalUserRecord = Omit<User, "unionId"> & {
  unionId: string;
  passwordHash?: string | null;
};

type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

type LocalDeviceRecord = {
  id: string;
  userId: number;
  deviceName: string;
  deviceType: DeviceType;
  userAgent: string | null;
  ipAddress: string | null;
  isTrusted: boolean;
  firstSeenAt: Date;
  lastActiveAt: Date;
};

type LocalSessionEvent = {
  id: string;
  userId: number;
  event: "sign-in" | "sign-out";
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

const usersById = new Map<number, LocalUserRecord>();
const usersByUnionId = new Map<string, LocalUserRecord>();
const usersByUsername = new Map<string, LocalUserRecord>();
const usersByEmail = new Map<string, LocalUserRecord>();
const devicesByUserId = new Map<number, Map<string, LocalDeviceRecord>>();
const sessionsByUserId = new Map<number, LocalSessionEvent[]>();

let nextId = 1;

function syncIndexes(user: LocalUserRecord) {
  usersById.set(user.id, user);
  usersByUnionId.set(user.unionId, user);
  usersByUsername.set(user.username.toLowerCase(), user);
  usersByEmail.set(user.email.toLowerCase(), user);
}

function getDeviceMap(userId: number) {
  const existing = devicesByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const next = new Map<string, LocalDeviceRecord>();
  devicesByUserId.set(userId, next);
  return next;
}

function getSessionLog(userId: number) {
  const existing = sessionsByUserId.get(userId);
  if (existing) {
    return existing;
  }

  const next: LocalSessionEvent[] = [];
  sessionsByUserId.set(userId, next);
  return next;
}

function detectDeviceType(userAgent: string | null) {
  const ua = (userAgent || "").toLowerCase();
  if (ua.includes("mobile")) return "mobile";
  if (ua.includes("tablet")) return "tablet";
  if (ua) return "desktop";
  return "unknown";
}

function detectDeviceName(userAgent: string | null) {
  if (!userAgent) return "Unknown Device";
  if (userAgent.includes("Chrome")) return "Chrome Browser";
  if (userAgent.includes("Firefox")) return "Firefox Browser";
  if (userAgent.includes("Safari")) return "Safari Browser";
  return "Current Browser";
}

function clearIndexes(user: LocalUserRecord) {
  if (usersById.get(user.id) === user) {
    usersById.delete(user.id);
  }
  if (user.unionId && usersByUnionId.get(user.unionId) === user) {
    usersByUnionId.delete(user.unionId);
  }
  if (usersByUsername.get(user.username.toLowerCase()) === user) {
    usersByUsername.delete(user.username.toLowerCase());
  }
  if (usersByEmail.get(user.email.toLowerCase()) === user) {
    usersByEmail.delete(user.email.toLowerCase());
  }
}

function toLocalUser(data: InsertUser & { passwordHash?: string | null }): LocalUserRecord {
  const now = new Date();
  return {
    id: Number(data.id ?? nextId++),
    unionId: data.unionId ?? `local_${nanoid()}`,
    email: data.email,
    username: data.username,
    displayName: data.displayName ?? null,
    name: data.name ?? data.displayName ?? data.username,
    avatar: data.avatar ?? null,
    passwordHash: data.passwordHash ?? null,
    role: data.role ?? "user",
    plan: data.plan ?? "free",
    storageUsed: data.storageUsed ?? 0,
    storageQuota: data.storageQuota ?? 10737418240,
    encryptionMode: data.encryptionMode ?? "standard",
    publicKey: data.publicKey ?? null,
    privateKeyEncrypted: data.privateKeyEncrypted ?? null,
    emailVerified: data.emailVerified ?? false,
    twoFactorEnabled: data.twoFactorEnabled ?? false,
    trustedDevices: data.trustedDevices ?? null,
    lastSignInAt: data.lastSignInAt ?? now,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

function saveLocalUser(data: InsertUser & { passwordHash?: string | null }) {
  const existing = data.id ? usersById.get(Number(data.id)) : undefined;
  if (existing) {
    clearIndexes(existing);
  }

  const user = toLocalUser(data);
  syncIndexes(user);
  return user;
}

export function findLocalUserByUnionId(unionId: string) {
  return usersByUnionId.get(unionId);
}

export function findLocalUserByUsernameOrEmail(identifier: string) {
  const lower = identifier.toLowerCase();
  return usersByUsername.get(lower) ?? usersByEmail.get(lower);
}

export function ensureLocalUserUnionId(user: LocalUserRecord) {
  if (user.unionId) {
    return user;
  }

  clearIndexes(user);
  const updatedUser = { ...user, unionId: `local_${nanoid()}`, updatedAt: new Date() };
  syncIndexes(updatedUser);
  return updatedUser;
}

export function upsertLocalUser(data: InsertUser & { passwordHash?: string | null }) {
  return saveLocalUser(data);
}

export function updateLocalUserLastSignIn(user: LocalUserRecord) {
  clearIndexes(user);
  const updatedUser = { ...user, lastSignInAt: new Date(), updatedAt: new Date() };
  syncIndexes(updatedUser);
  return updatedUser;
}

export function getLocalUserById(userId: number) {
  return usersById.get(userId) ?? null;
}

export function updateLocalUserSecurity(
  userId: number,
  input: Partial<Pick<LocalUserRecord, "displayName" | "email" | "avatar" | "twoFactorEnabled" | "encryptionMode" | "trustedDevices">>
) {
  const user = usersById.get(userId);
  if (!user) return null;

  clearIndexes(user);
  const updatedUser = {
    ...user,
    ...input,
    updatedAt: new Date(),
  };
  syncIndexes(updatedUser);
  return updatedUser;
}

export function recordLocalSession(
  userId: number,
  input: { userAgent?: string | null; ipAddress?: string | null; event?: "sign-in" | "sign-out" }
) {
  const user = usersById.get(userId);
  if (!user) return null;

  const userAgent = input.userAgent ?? null;
  const deviceType = detectDeviceType(userAgent);
  const deviceName = detectDeviceName(userAgent);
  const deviceId = crypto.createHash("sha1").update(`${userId}:${deviceName}:${deviceType}:${userAgent || ""}`).digest("hex").slice(0, 16);
  const deviceMap = getDeviceMap(userId);
  const now = new Date();
  const existingDevice = deviceMap.get(deviceId);

  const nextDevice: LocalDeviceRecord = existingDevice
    ? {
        ...existingDevice,
        deviceName,
        deviceType,
        userAgent,
        ipAddress: input.ipAddress ?? existingDevice.ipAddress,
        lastActiveAt: now,
      }
    : {
        id: deviceId,
        userId,
        deviceName,
        deviceType,
        userAgent,
        ipAddress: input.ipAddress ?? null,
        isTrusted: false,
        firstSeenAt: now,
        lastActiveAt: now,
      };

  deviceMap.set(deviceId, nextDevice);

  const event: LocalSessionEvent = {
    id: crypto.randomUUID(),
    userId,
    event: input.event || "sign-in",
    deviceId,
    deviceName,
    deviceType,
    userAgent,
    ipAddress: input.ipAddress ?? null,
    createdAt: now,
  };

  getSessionLog(userId).unshift(event);
  return { device: nextDevice, event };
}

export function listLocalDevices(userId: number) {
  return Array.from(getDeviceMap(userId).values()).sort(
    (a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime()
  );
}

export function listLocalSessions(userId: number) {
  return [...getSessionLog(userId)];
}

export function setLocalDeviceTrust(userId: number, deviceId: string, trusted: boolean) {
  const deviceMap = getDeviceMap(userId);
  const device = deviceMap.get(deviceId);
  if (!device) return null;

  const updated = { ...device, isTrusted: trusted, lastActiveAt: new Date() };
  deviceMap.set(deviceId, updated);
  return updated;
}

export function revokeLocalDevice(userId: number, deviceId: string) {
  const deviceMap = getDeviceMap(userId);
  const device = deviceMap.get(deviceId);
  if (!device) return null;

  deviceMap.delete(deviceId);
  return device;
}

export function clearLocalSessions(userId: number) {
  devicesByUserId.set(userId, new Map());
  sessionsByUserId.set(userId, []);
  const user = usersById.get(userId);
  if (!user) return false;

  clearIndexes(user);
  const updatedUser = { ...user, trustedDevices: [], updatedAt: new Date() };
  syncIndexes(updatedUser);
  return true;
}

export function deleteLocalUser(userId: number) {
  const user = usersById.get(userId);
  if (!user) return false;

  clearIndexes(user);
  devicesByUserId.delete(userId);
  sessionsByUserId.delete(userId);
  return true;
}

export function adjustLocalUserStorageUsed(userId: number, delta: number) {
  const user = usersById.get(userId);
  if (!user) {
    return null;
  }

  clearIndexes(user);
  const updatedUser = {
    ...user,
    storageUsed: Math.max(0, (user.storageUsed || 0) + delta),
    updatedAt: new Date(),
  };
  syncIndexes(updatedUser);
  return updatedUser;
}
