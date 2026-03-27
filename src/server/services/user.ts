import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";

// ── Types ─────────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "developer";

// ── Rate limiter (in-memory, swap for Redis in prod) ──────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, limit = 20, windowMs = 60_000): void {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (entry.count >= limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Rate limit exceeded. Please wait before sending another message.",
    });
  }
  entry.count++;
}

// ── User helpers ──────────────────────────────────────────────

/** Get a user by ID — throws NOT_FOUND if missing */
export async function getUserById(userId: string) {
  const found = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  return found;
}

/** Get or create a user record (useful for guest/OAuth flows) */
export async function getOrCreateUser(data: {
  id: string;
  email: string;
  name: string;
  image?: string;
}) {
  const existing = await db.query.user.findFirst({
    where: eq(user.id, data.id),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(user)
    .values({ ...data, role: "user", emailVerified: false })
    .returning();
  return created;
}

/** Check if user has an allowed role */
export function assertRole(
  userRole: UserRole,
  allowed: UserRole[],
  message = "Insufficient permissions",
): void {
  if (!allowed.includes(userRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}