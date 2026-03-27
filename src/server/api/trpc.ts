import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import { ZodError } from "zod";

import { db } from "@/server/db";
import { getSession } from "@/server/better-auth/server";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getSession();
  return {
    db,
    session,
    ...opts,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: SuperJSON,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

// ── Middlewares ────────────────────────────────────────────────

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === "development") {
    console.log(`[tRPC] ${path} — ${duration}ms`);
  }
  return result;
});

// ── Procedures ────────────────────────────────────────────────

/** Anyone can call — no session required */
export const publicProcedure = t.procedure.use(timingMiddleware);

/** Must be logged in */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session, // narrowed — guaranteed non-null
      },
    });
  });

/** Must be logged in AND have role admin or developer */
export const adminProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    const role = (ctx.session.user as { role?: string }).role;
    if (role !== "admin" && role !== "developer") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({
      ctx: {
        ...ctx,
        session: ctx.session,
      },
    });
  });