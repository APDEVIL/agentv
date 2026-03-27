import { ilike, eq, and } from "drizzle-orm";

import { db } from "@/server/db";
import { knowledgeBase, escalations } from "@/server/db/schema";
import { complete } from "./ai";

// ── FAQ search ─────────────────────────────────────────────────

/** Keyword-based search — replace with pgvector semantic search when ready */
export async function searchKnowledge(
  query: string,
  options: { category?: string; limit?: number } = {}
) {
  const { category, limit = 5 } = options;

  const conditions = [
    eq(knowledgeBase.isActive, true),
    ilike(knowledgeBase.question, `%${query}%`),
    ...(category ? [eq(knowledgeBase.category, category)] : []),
  ];

  return db.query.knowledgeBase.findMany({
    where: and(...conditions),
    limit,
  });
}

/**
 * Semantic search placeholder.
 * Swap searchKnowledge for this once pgvector is enabled:
 *
 * 1. Change embedding column: vector(1536) from drizzle-orm/pg-core
 * 2. Generate embedding for query via embedText()
 * 3. Use cosine_distance or l2_distance operator
 */
export async function semanticSearch(
  _query: string,
  _limit = 5
): Promise<typeof knowledgeBase.$inferSelect[]> {
  throw new Error(
    "Semantic search not yet enabled. Enable pgvector and implement embedText() first."
  );
}

// ── Embedding ──────────────────────────────────────────────────

/** Generate an embedding vector for a text string (OpenAI) */
export async function embedText(text: string): Promise<number[]> {
  const { env } = await import("@/env");
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for embeddings");

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const result = await client.embeddings.create({
    model: env.OPENAI_EMBEDDING_MODEL,
    input: text,
  });

  return result.data[0]!.embedding;
}

// ── Auto-generate KB entries from text ────────────────────────

export async function generateKBEntry(sourceText: string): Promise<{
  question: string;
  answer: string;
  category: string;
}> {
  const systemPrompt = `You extract FAQ entries from text. Respond ONLY with valid JSON:
{"question": "...", "answer": "...", "category": "<snake_case_category>"}`;

  const result = await complete(
    [{ role: "user", content: `Extract one FAQ entry from this text:\n\n${sourceText}` }],
    { systemPrompt, maxTokens: 256, temperature: 0.2 }
  );

  try {
    return JSON.parse(result.content) as {
      question: string;
      answer: string;
      category: string;
    };
  } catch {
    return {
      question: "What is this about?",
      answer: sourceText.slice(0, 300),
      category: "general",
    };
  }
}

// ── Escalation helpers ─────────────────────────────────────────

export async function createEscalation(
  conversationId: string,
  userId: string,
  reason?: string
) {
  const [escalation] = await db
    .insert(escalations)
    .values({ conversationId, userId, reason, status: "pending" })
    .returning();
  return escalation;
}

export async function resolveEscalation(escalationId: string, resolvedById: string) {
  await db
    .update(escalations)
    .set({ status: "resolved", resolvedById, updatedAt: new Date() })
    .where(eq(escalations.id, escalationId));
}