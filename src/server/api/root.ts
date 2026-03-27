import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { userRouter } from "./routers/user";
import { chatRouter } from "./routers/chat";
import { agentRouter } from "./routers/agent";
import { knowledgeRouter } from "./routers/knowledge";
import { analyticsRouter } from "./routers/analytics";
import { adminRouter } from "./routers/admin";

export const appRouter = createTRPCRouter({
  user: userRouter,
  chat: chatRouter,
  agent: agentRouter,
  knowledge: knowledgeRouter,
  analytics: analyticsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);