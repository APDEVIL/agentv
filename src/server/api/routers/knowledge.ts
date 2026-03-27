import { z } from "zod";
import { eq, ilike, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure, adminProcedure } from "../trpc";
import { knowledgeBase, escalations } from "@/server/db/schema";

export const knowledgeRouter = createTRPCRouter({

  /** Search FAQ knowledge base (used by agent at runtime) */
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
      category: z.string().optional(),
      limit: z.number().min(1).max(20).default(5),
    }))
    .query(async ({ ctx, input }) => {
      // Basic keyword search — swap for pgvector semantic search later
      const conditions = [
        eq(knowledgeBase.isActive, true),
        ilike(knowledgeBase.question, `%${input.query}%`),
        ...(input.category ? [eq(knowledgeBase.category, input.category)] : []),
      ];
      return ctx.db.query.knowledgeBase.findMany({
        where: and(...conditions),
        limit: input.limit,
      });
    }),

  /** Admin: list all KB entries */
  list: adminProcedure
    .input(z.object({
      category: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.knowledgeBase.findMany({
        where: input.category ? eq(knowledgeBase.category, input.category) : undefined,
        limit: input.limit,
        offset: input.offset,
        orderBy: (kb, { desc }) => [desc(kb.createdAt)],
      });
    }),

  /** Admin: create a KB entry */
  create: adminProcedure
    .input(z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      category: z.string().optional(),
      source: z.enum(["manual", "imported", "generated"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db.insert(knowledgeBase).values(input).returning();
      return entry;
    }),

  /** Admin: update a KB entry */
  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      question: z.string().min(1).optional(),
      answer: z.string().min(1).optional(),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const [updated] = await ctx.db
        .update(knowledgeBase)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(knowledgeBase.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Admin: delete a KB entry */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(knowledgeBase).where(eq(knowledgeBase.id, input.id));
      return { success: true };
    }),

  /** Escalate a conversation to a human agent */
  escalate: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [escalation] = await ctx.db
        .insert(escalations)
        .values({
          conversationId: input.conversationId,
          userId: ctx.session.user.id,
          reason: input.reason,
          status: "pending",
        })
        .returning();
      return escalation;
    }),

  /** Admin: resolve an escalation */
  resolveEscalation: adminProcedure
    .input(z.object({ escalationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(escalations)
        .set({ status: "resolved", resolvedById: ctx.session.user.id, updatedAt: new Date() })
        .where(eq(escalations.id, input.escalationId));
      return { success: true };
    }),
});