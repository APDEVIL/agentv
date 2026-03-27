import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { conversations, messages } from "@/server/db/schema";
import { type ChatMessage } from "./ai";

// ── Session / conversation lifecycle ───────────────────────────

export async function getOrCreateConversation(
  userId: string,
  agentId?: string,
  language = "en"
) {
  // Find the most recent non-archived conversation for this user+agent combo
  const existing = await db.query.conversations.findFirst({
    where: eq(conversations.userId, userId),
    orderBy: (c, { desc }) => [desc(c.updatedAt)],
  });

  if (existing && !existing.isArchived) return existing;

  const [created] = await db
    .insert(conversations)
    .values({ userId, agentId, language })
    .returning();
  return created;
}

/** Load full conversation history formatted for the LLM */
export async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const msgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversationId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
    limit: 40, // keep last 40 messages — enough context, won't blow the context window
  });

  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}

/** Persist a message to DB */
export async function saveMessage(data: {
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tokens?: number;
}) {
  const [msg] = await db.insert(messages).values(data).returning();
  // Bump conversation updatedAt so latest-first ordering works
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, data.conversationId));
  return msg;
}

// ── SSE streaming helper ───────────────────────────────────────

/**
 * Format a token chunk as an SSE event.
 * Used by app/api/stream/[id]/route.ts
 *
 * SSE format:
 *   data: <json>\n\n
 */
export function formatSSEEvent(
  event: "token" | "done" | "error",
  payload: unknown
): string {
  return `data: ${JSON.stringify({ event, payload })}\n\n`;
}

// ── Language helpers ───────────────────────────────────────────

const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  hi: "Hindi",
  zh: "Chinese",
  ar: "Arabic",
  ja: "Japanese",
};

export function getSupportedLanguages() {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({ code, name }));
}

export function isLanguageSupported(code: string): boolean {
  return code in SUPPORTED_LANGUAGES;
}

/** Detect language from a short text snippet using LLM */
export async function detectLanguage(text: string): Promise<string> {
  const { complete } = await import("./ai");
  const result = await complete(
    [{ role: "user", content: `What language is this text? Reply with only the ISO 639-1 language code (e.g. en, es, fr):\n\n${text}` }],
    { maxTokens: 5, temperature: 0 }
  );
  const code = result.content.trim().toLowerCase().slice(0, 2);
  return isLanguageSupported(code) ? code : "en";
}