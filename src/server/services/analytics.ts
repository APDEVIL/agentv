import { db } from "@/server/db";
import { queryLogs, auditLogs } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";

// ── Query logging ──────────────────────────────────────────────

export interface QueryLogEntry {
  userId?: string;
  conversationId?: string;
  intent?: string;
  latencyMs: number;
  tokensUsed?: number;
  resolved: boolean;
}

/** Log a completed agent query — called at the end of every agent run */
export async function logQuery(entry: QueryLogEntry): Promise<void> {
  try {
    await db.insert(queryLogs).values({
      userId: entry.userId,
      conversationId: entry.conversationId,
      intent: entry.intent,
      latencyMs: entry.latencyMs,
      tokensUsed: entry.tokensUsed,
      resolved: entry.resolved,
    });
  } catch (err) {
    // Never let logging failures crash the main flow
    console.error("[analytics] Failed to log query:", err);
  }
}

// ── Audit logging ──────────────────────────────────────────────

export interface AuditEntry {
  userId?: string;
  action: string;           // e.g. "faq.create", "user.ban", "agent.update"
  entity?: string;          // e.g. "knowledge_base", "user"
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Write an audit trail entry — call from admin/service actions */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    // Mapping explicitly ensures only schema-compliant keys are sent to Drizzle
    await db.insert(auditLogs).values({
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata,
    });
  } catch (err) {
    console.error("[analytics] Failed to write audit log:", err);
  }
}

// ── Health check ───────────────────────────────────────────────

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  db: "ok" | "error";
  timestamp: string;
  uptime: number;           // seconds
}

const startTime = Date.now();

export async function getHealth(): Promise<HealthStatus> {
  let dbStatus: "ok" | "error" = "ok";

  try {
    // FIXED: Use the 'sql' template literal instead of a raw object.
    // Drizzle expects a SQLWrapper, which the sql`` tag provides.
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    console.error("[health] Database connection failed:", err);
    dbStatus = "error";
  }

  const overall = dbStatus === "ok" ? "ok" : "error";

  return {
    status: overall,
    db: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
}

// ── Perf timer helper ──────────────────────────────────────────

/** Wrap an async fn, return result + latency in ms */
export async function withTiming<T>(
  fn: () => Promise<T>
): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}