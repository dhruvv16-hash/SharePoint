import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { runWorkspaceFlow } from "../dev/workspace-flow";

export const devRouter = createRouter({
  runWorkspaceFlow: publicQuery.input(z.object({}).optional()).mutation(async () => runWorkspaceFlow()),
});