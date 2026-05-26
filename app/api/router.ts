import { authRouter } from "./auth-router";
import { localAuthRouter } from "./routers/local-auth";
import { vaultRouter } from "./routers/vault";
import { uploadRouter } from "./routers/upload";
import { shareRouter } from "./routers/share";
import { recoveryRouter } from "./routers/recovery";
import { versionRouter } from "./routers/version";
import { snapshotRouter } from "./routers/snapshot";
import { searchRouter } from "./routers/search";
import { workspaceRouter } from "./routers/workspace";
import { devRouter } from "./routers/dev";
import { adminRouter } from "./routers/admin";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  localAuth: localAuthRouter,
  vault: vaultRouter,
  upload: uploadRouter,
  share: shareRouter,
  recovery: recoveryRouter,
  version: versionRouter,
  snapshot: snapshotRouter,
  search: searchRouter,
  workspace: workspaceRouter,
  dev: devRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
