import { z } from "zod";
import { desc, gte, sql, count } from "drizzle-orm";

import { createTRPCRouter, adminProcedure } from "../trpc";
import { queryLogs, conversations, messages } from "@/server/db/schema";

export const analyticsRouter = createTRPCRouter({

  /** Usage stats for the dashboard — E5 */
  overview: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 86_400_000);

      const [totalConversations] = await ctx.db
        .select({ count: count() })
        .from(conversations)
        .where(gte(conversations.createdAt, since));

      const [totalMessages] = await ctx.db
        .select({ count: count() })
        .from(messages)
        .where(gte(messages.createdAt, since));

      const [avgLatency] = await ctx.db
        .select({ avg: sql<number>`avg(${queryLogs.latencyMs})` })
        .from(queryLogs)
        .where(gte(queryLogs.createdAt, since));

      const [avgTokens] = await ctx.db
        .select({ avg: sql<number>`avg(${queryLogs.tokensUsed})` })
        .from(queryLogs)
        .where(gte(queryLogs.createdAt, since));

      return {
        totalConversations: totalConversations?.count ?? 0,
        totalMessages: totalMessages?.count ?? 0,
        avgLatencyMs: Math.round(avgLatency?.avg ?? 0),
        avgTokensPerQuery: Math.round(avgTokens?.avg ?? 0),
      };
    }),

  /** Top intents — E5 */
  topIntents: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          intent: queryLogs.intent,
          count: count(),
        })
        .from(queryLogs)
        .groupBy(queryLogs.intent)
        .orderBy(desc(count()))
        .limit(input.limit);
    }),

  /** Recent query logs — E5 */
  recentLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(25) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.queryLogs.findMany({
        orderBy: [desc(queryLogs.createdAt)],
        limit: input.limit,
      });
    }),
});