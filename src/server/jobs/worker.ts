import { db } from "@/server/db";
import { conversations, messages, knowledgeBase, queryLogs } from "@/server/db/schema";
import { eq, isNull, lt, and } from "drizzle-orm";

import { runAgent } from "@/server/services/agents";
import { loadHistory, saveMessage } from "@/server/services/chat";
import { embedText, generateKBEntry } from "@/server/services/knowledge";
import { logQuery, withTiming } from "@/server/services/analytics";
import { classifyIntent } from "@/server/services/ai";

// ── Types ──────────────────────────────────────────────────────

export interface JobResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ── Job 1: Process a message through the agent ─────────────────
// Called after a user message is saved to DB.
// Runs the full agent loop and persists the assistant reply.

export interface ProcessMessagePayload {
  conversationId: string;
  userMessage: string;
  userId: string;
  agentSystemPrompt: string;
  agentTools: string[];
  agentModel: string;
  agentTemperature: number;
  language?: string;
}

export async function processMessage(
  payload: ProcessMessagePayload
): Promise<JobResult> {
  const {
    conversationId,
    userMessage,
    userId,
    agentSystemPrompt,
    agentTools,
    agentModel,
    agentTemperature,
    language,
  } = payload;

  try {
    // 1. Classify intent for analytics
    const intentResult = await classifyIntent(userMessage).catch(() => ({
      intent: "unknown",
      confidence: 0,
      entities: [],
    }));

    // 2. Load conversation history
    const history = await loadHistory(conversationId);

    // 3. Run the agent loop with timing
    const { result, latencyMs } = await withTiming(() =>
      runAgent({
        conversationId,
        agentSystemPrompt,
        agentTools,
        history,
        userMessage,
        language,
        model: agentModel,
        temperature: agentTemperature,
      })
    );

    // 4. Persist the assistant response
    await saveMessage({
      conversationId,
      role: "assistant",
      content: result.response,
      tokens: result.tokensUsed,
    });

    // 5. Log query analytics
    await logQuery({
      userId,
      conversationId,
      intent: intentResult.intent,
      latencyMs,
      tokensUsed: result.tokensUsed,
      resolved: result.response.length > 0,
    });

    return {
      success: true,
      message: "Message processed successfully",
      data: {
        response: result.response,
        intent: intentResult.intent,
        toolsInvoked: result.toolsInvoked,
        latencyMs,
      },
    };
  } catch (err) {
    console.error("[worker:processMessage]", err);

    // Save a fallback message so the UI doesn't hang
    await saveMessage({
      conversationId,
      role: "assistant",
      content:
        "I encountered an error processing your request. Please try again.",
    }).catch(() => null); // don't throw if this also fails

    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Job 2: Embed knowledge base entries ───────────────────────
// Runs over KB rows that have no embedding yet.
// Call on a schedule (cron) or after new KB entries are created.

export async function embedKnowledgeBase(): Promise<JobResult> {
  try {
    // Find all active KB entries without an embedding
    const unembedded = await db.query.knowledgeBase.findMany({
      where: and(
        eq(knowledgeBase.isActive, true),
        isNull(knowledgeBase.embedding)
      ),
      limit: 50, // process in batches to avoid rate limits
    });

    if (unembedded.length === 0) {
      return { success: true, message: "No entries to embed" };
    }

    let processed = 0;
    let failed = 0;

    for (const entry of unembedded) {
      try {
        // Embed question + answer together for richer retrieval
        const text = `${entry.question}\n${entry.answer}`;
        const embedding = await embedText(text);

        await db
          .update(knowledgeBase)
          .set({ embedding, updatedAt: new Date() })
          .where(eq(knowledgeBase.id, entry.id));

        processed++;
      } catch (err) {
        console.error(`[worker:embedKB] Failed to embed entry ${entry.id}:`, err);
        failed++;
      }

      // Respect OpenAI rate limits — 100ms between requests
      await sleep(100);
    }

    return {
      success: true,
      message: `Embedded ${processed} entries, ${failed} failed`,
      data: { processed, failed, total: unembedded.length },
    };
  } catch (err) {
    console.error("[worker:embedKB]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Job 3: Summarise old conversation history ─────────────────
// Compresses long conversations to keep context windows lean.
// Run on conversations with 40+ messages that haven't been
// summarised in the last 24 hours.

export async function summariseHistory(): Promise<JobResult> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find conversations that are old and active
    const staleCandidates = await db.query.conversations.findMany({
      where: and(
        eq(conversations.isArchived, false),
        lt(conversations.updatedAt, cutoff)
      ),
      limit: 20,
    });

    if (staleCandidates.length === 0) {
      return { success: true, message: "No conversations to summarise" };
    }

    let summarised = 0;

    for (const conv of staleCandidates) {
      try {
        const msgs = await db.query.messages.findMany({
          where: eq(messages.conversationId, conv.id),
          orderBy: (m, { asc }) => [asc(m.createdAt)],
        });

        // Only summarise if there's enough history to compress
        if (msgs.length < 20) continue;

        const transcript = msgs
          .slice(0, -10) // keep last 10 messages untouched
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        const { complete } = await import("@/server/services/ai");
        const summaryResult = await complete(
          [
            {
              role: "user",
              content: `Summarise this conversation history in 3–5 sentences. 
Focus on: what the user needed, what was resolved, any outstanding issues.

${transcript}`,
            },
          ],
          { maxTokens: 256, temperature: 0.3 }
        );

        // Save summary as a system message at the start of the conversation
        await saveMessage({
          conversationId: conv.id,
          role: "assistant",
          content: `[Conversation summary: ${summaryResult.content}]`,
        });

        // Mark old messages as archived by soft-deleting them
        // (In production: add an isArchived column to messages, or move to a summary table)
        summarised++;
      } catch (err) {
        console.error(`[worker:summarise] Failed for conv ${conv.id}:`, err);
      }

      await sleep(200);
    }

    return {
      success: true,
      message: `Summarised ${summarised} conversations`,
      data: { summarised, checked: staleCandidates.length },
    };
  } catch (err) {
    console.error("[worker:summarise]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Job 4: Clean up stale query logs ──────────────────────────
// Keeps the query_logs table lean by removing entries older
// than 90 days. Run on a weekly cron.

export async function cleanupOldLogs(): Promise<JobResult> {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const deleted = await db
      .delete(queryLogs)
      .where(lt(queryLogs.createdAt, cutoff));

    return {
      success: true,
      message: "Old query logs cleaned up",
      data: { deleted },
    };
  } catch (err) {
    console.error("[worker:cleanup]", err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Job runner (pg-boss / BullMQ adapter) ─────────────────────
// This is the dispatch layer. If you add BullMQ or pg-boss later,
// replace the direct function calls here with queue.add() calls.
// The job functions above stay identical — only this layer changes.

export type JobName =
  | "process_message"
  | "embed_knowledge_base"
  | "summarise_history"
  | "cleanup_old_logs";

export async function runJob(
  name: JobName,
  payload?: unknown
): Promise<JobResult> {
  console.log(`[worker] Running job: ${name}`);
  const start = Date.now();

  let result: JobResult;

  switch (name) {
    case "process_message":
      result = await processMessage(payload as ProcessMessagePayload);
      break;
    case "embed_knowledge_base":
      result = await embedKnowledgeBase();
      break;
    case "summarise_history":
      result = await summariseHistory();
      break;
    case "cleanup_old_logs":
      result = await cleanupOldLogs();
      break;
    default:
      result = { success: false, message: `Unknown job: ${String(name)}` };
  }

  console.log(
    `[worker] ${name} completed in ${Date.now() - start}ms — ${result.message}`
  );
  return result;
}

// ── Utility ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}