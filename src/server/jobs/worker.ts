import { db } from "@/server/db";
import { conversations, messages, knowledgeBase, queryLogs } from "@/server/db/schema";
import { eq, isNull, lt, and } from "drizzle-orm";
import { env } from "@/env";

import { runAgent } from "@/server/services/agent";
import { loadHistory, saveMessage } from "@/server/services/chat";
import { logQuery, withTiming } from "@/server/services/analytics";
import { classifyIntent, complete } from "@/server/services/ai";

// ── Types ──────────────────────────────────────────────────────

export interface JobResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ── Job 1: Process a message through the agent ─────────────────

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
    const intentResult = await classifyIntent(userMessage).catch(() => ({
      intent: "unknown",
      confidence: 0,
      entities: [],
    }));

    const history = await loadHistory(conversationId);

    const { result, latencyMs } = await withTiming(() =>
      runAgent({
        conversationId,
        agentSystemPrompt,
        agentTools,
        history,
        userMessage,
        language,
        model: agentModel ?? env.GROQ_MODEL,   // ← Groq model default
        temperature: agentTemperature,
      })
    );

    await saveMessage({
      conversationId,
      role: "assistant",
      content: result.response,
      tokens: result.tokensUsed,
    });

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

    await saveMessage({
      conversationId,
      role: "assistant",
      content: "I encountered an error processing your request. Please try again.",
    }).catch(() => null);

    return {
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// ── Job 2: Embed knowledge base entries ───────────────────────
// NOTE: Groq doesn't provide embeddings.
// This job is a no-op until a free embedding provider is configured
// (e.g. Hugging Face, Nomic, or Cohere free tier).

export async function embedKnowledgeBase(): Promise<JobResult> {
  const unembedded = await db.query.knowledgeBase.findMany({
    where: and(
      eq(knowledgeBase.isActive, true),
      isNull(knowledgeBase.embedding)
    ),
    limit: 50,
  });

  if (unembedded.length === 0) {
    return { success: true, message: "No entries to embed" };
  }

  // Embeddings not configured — skip silently in dev
  console.warn(
    `[worker:embedKB] ${unembedded.length} entries need embeddings but no embedding provider is configured. ` +
    `KB search will use keyword matching until an embedding provider is added.`
  );

  return {
    success: true,
    message: "Skipped — no embedding provider configured. Keyword search is active.",
    data: { skipped: unembedded.length },
  };
}

// ── Job 3: Summarise old conversation history ─────────────────

export async function summariseHistory(): Promise<JobResult> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

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

        if (msgs.length < 20) continue;

        const transcript = msgs
          .slice(0, -10)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        const summaryResult = await complete(
          [
            {
              role: "user",
              content: `Summarise this conversation history in 3–5 sentences.
Focus on: what the user needed, what was resolved, any outstanding issues.\n\n${transcript}`,
            },
          ],
          {
            maxTokens: 256,
            temperature: 0.3,
            model: env.GROQ_MODEL,   // ← Groq model default
          }
        );

        await saveMessage({
          conversationId: conv.id,
          role: "assistant",
          content: `[Conversation summary: ${summaryResult.content}]`,
        });

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

// ── Job runner ─────────────────────────────────────────────────

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