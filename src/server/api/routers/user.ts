import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure, adminProcedure } from "@/server/api/trpc";
import { user } from "@/server/db/schema";

export const userRouter = createTRPCRouter({

  /** Get the currently logged-in user's profile */
  me: protectedProcedure.query(async ({ ctx }) => {
    const found = await ctx.db.query.user.findFirst({
      where: eq(user.id, ctx.session.user.id),
      columns: { id: true, name: true, email: true, image: true, role: true, createdAt: true },
    });
    if (!found) throw new TRPCError({ code: "NOT_FOUND" });
    return found;
  }),

  /** Update display name or avatar */
  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      image: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  /** Admin: list all users with their roles */
  list: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.user.findMany({
        columns: { id: true, name: true, email: true, role: true, createdAt: true },
        limit: input.limit,
        offset: input.offset,
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });
    }),

  /** Admin: change a user's role */
  setRole: adminProcedure
    .input(z.object({
      userId: z.string(),
      role: z.enum(["user", "admin", "developer"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(user.id, input.userId));
      return { success: true };
    }),
});