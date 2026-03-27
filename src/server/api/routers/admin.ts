import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { createTRPCRouter, adminProcedure } from "../trpc";
import { auditLogs, conversations, escalations, messages } from "@/server/db/schema";

export const adminRouter = createTRPCRouter({

  /** Live feed of recent conversations for monitoring — E8 */
  recentConversations: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.conversations.findMany({
        orderBy: [desc(conversations.updatedAt)],
        limit: input.limit,
        with: { user: { columns: { id: true, name: true, email: true } } },
      });
    }),

  /** View messages inside any conversation — E8 */
  getConversationMessages: adminProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.messages.findMany({
        where: eq(messages.conversationId, input.conversationId),
        orderBy: [desc(messages.createdAt)],
      });
    }),

  /** All pending escalations — E8 */
  pendingEscalations: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.escalations.findMany({
      where: eq(escalations.status, "pending"),
      orderBy: [desc(escalations.createdAt)],
      with: {
        conversation: true,
      },
    });
  }),

  /** Write an audit log entry — called by services, not frontend directly */
  logAudit: adminProcedure
    .input(z.object({
      action: z.string().max(100),
      entity: z.string().max(100).optional(),
      entityId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(auditLogs).values({
        userId: ctx.session.user.id,
        ...input,
      });
      return { success: true };
    }),

  /** Audit trail — E8 */
  auditTrail: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      action: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.auditLogs.findMany({
        where: input.action ? eq(auditLogs.action, input.action) : undefined,
        orderBy: [desc(auditLogs.createdAt)],
        limit: input.limit,
      });
    }),

  /** System health snapshot — E8 */
  health: adminProcedure.query(async ({ ctx }) => {
    try {
      await ctx.db.execute(sql`SELECT 1`);
      return { db: "ok", timestamp: new Date().toISOString() };
    } catch {
      return { db: "error", timestamp: new Date().toISOString() };
    }
  }),
});

import { sql } from "drizzle-orm";