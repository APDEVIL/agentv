import { ilike, eq, and } from "drizzle-orm";

import { db } from "@/server/db";
import { knowledgeBase, escalations } from "@/server/db/schema";
import { complete } from "./ai";

// ── FAQ search ─────────────────────────────────────────────────

/** Keyword-based search — replace with semantic search when ready */
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

// ── Embedding ──────────────────────────────────────────────────

/**
 * Embedding is not configured — Groq does not provide embeddings.
 * To enable semantic search, add a free provider:
 * - Hugging Face Inference API (free)
 * - Nomic Embed (free tier)
 * - Cohere Embed (free tier)
 *
 * KB search currently uses keyword matching via searchKnowledge().
 */
export async function embedText(_text: string): Promise<number[]> {
  throw new Error(
    "Embedding not configured. Using keyword search instead."
  );
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
    [
      {
        role: "user",
        content: `Extract one FAQ entry from this text:\n\n${sourceText}`,
      },
    ],
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

export async function resolveEscalation(
  escalationId: string,
  resolvedById: string
) {
  await db
    .update(escalations)
    .set({ status: "resolved", resolvedById, updatedAt: new Date() })
    .where(eq(escalations.id, escalationId));
}