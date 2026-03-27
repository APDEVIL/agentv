import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { conversations, messages } from "@/server/db/schema";

export const chatRouter = createTRPCRouter({

  /** Start a new conversation (optionally attach an agent) */
  createConversation: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid().optional(),
      language: z.string().default("en"),
      title: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [conv] = await ctx.db
        .insert(conversations)
        .values({
          userId: ctx.session.user.id,
          agentId: input.agentId,
          language: input.language,
          title: input.title,
        })
        .returning();
      return conv;
    }),

  /** List conversations for the current user */
  listConversations: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.conversations.findMany({
        where: and(
          eq(conversations.userId, ctx.session.user.id),
          eq(conversations.isArchived, false)
        ),
        orderBy: [desc(conversations.updatedAt)],
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /** Get all messages in a conversation */
  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const conv = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });
      if (!conv || conv.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db.query.messages.findMany({
        where: eq(messages.conversationId, input.conversationId),
        orderBy: [desc(messages.createdAt)],
      });
    }),

  /** Send a user message — actual AI response is handled via SSE stream */
  sendMessage: protectedProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      content: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      const conv = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });
      if (!conv || conv.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [msg] = await ctx.db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
        })
        .returning();
      // Update conversation timestamp
      await ctx.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      return msg;
    }),

  /** Archive a conversation */
  archiveConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conv = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });
      if (!conv || conv.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db
        .update(conversations)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));
      return { success: true };
    }),

  /** Quick replies — static list, can be made dynamic later */
  quickReplies: publicProcedure.query(() => {
    return [
      { id: "hours", label: "Business hours" },
      { id: "pricing", label: "Pricing info" },
      { id: "support", label: "Talk to support" },
      { id: "docs", label: "View docs" },
    ];
  }),
});