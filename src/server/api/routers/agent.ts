import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure, adminProcedure } from "../trpc";
import { agents } from "@/server/db/schema";

const AgentInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  systemPrompt: z.string().min(1),
  model: z.string().default("gpt-4o"),
  temperature: z.number().min(0).max(100).default(70),
  tools: z.array(z.string()).default([]),
});

export const agentRouter = createTRPCRouter({

  /** List all active agents (any authenticated user can browse) */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.agents.findMany({
      where: eq(agents.isActive, true),
      columns: { id: true, name: true, description: true, model: true, tools: true },
    });
  }),

  /** Get a single agent by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const agent = await ctx.db.query.agents.findFirst({
        where: eq(agents.id, input.id),
      });
      if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
      return agent;
    }),

  /** Admin/Developer: create a new agent */
  create: adminProcedure
    .input(AgentInput)
    .mutation(async ({ ctx, input }) => {
      const [agent] = await ctx.db
        .insert(agents)
        .values({ ...input, createdById: ctx.session.user.id })
        .returning();
      return agent;
    }),

  /** Admin/Developer: update agent config */
  update: adminProcedure
    .input(AgentInput.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(agents)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agents.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Admin/Developer: soft-delete (deactivate) an agent */
  deactivate: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(agents)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(agents.id, input.id));
      return { success: true };
    }),

  /** List available tools the agent can use */
  availableTools: adminProcedure.query(() => {
    return [
      { name: "web_search", description: "Search the web via SERP API" },
      { name: "weather", description: "Get current weather by location" },
      { name: "knowledge_base", description: "Search internal FAQ knowledge base" },
      { name: "escalate", description: "Escalate conversation to human agent" },
    ];
  }),
});