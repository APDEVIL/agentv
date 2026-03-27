import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { conversations, agents } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { loadHistory, saveMessage, formatSSEEvent } from "@/server/services/chat";
import { streamComplete, buildPrompt, classifyIntent } from "@/server/services/ai";
import { logQuery } from "@/server/services/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;

  // ── Auth guard ───────────────────────────────────────────────
  const session = await getSession();
  if (!session?.user) {
    return new Response(
      formatSSEEvent("error", { message: "Unauthorized" }),
      { status: 401, headers: sseHeaders() }
    );
  }

  // ── Parse body ───────────────────────────────────────────────
  let userMessage: string;
  try {
    const body = await req.json() as { message?: string };
    userMessage = (body.message ?? "").trim();
    if (!userMessage) throw new Error("Empty message");
  } catch {
    return new Response(
      formatSSEEvent("error", { message: "Invalid request body" }),
      { status: 400, headers: sseHeaders() }
    );
  }

  // ── Verify conversation ownership ────────────────────────────
  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });

  if (!conversation || conversation.userId !== session.user.id) {
    return new Response(
      formatSSEEvent("error", { message: "Conversation not found" }),
      { status: 404, headers: sseHeaders() }
    );
  }

  // ── Load agent config ────────────────────────────────────────
  let systemPrompt = "You are a helpful virtual assistant.";
  let agentModel: string | undefined;
  let agentTemperature: number | undefined;

  if (conversation.agentId) {
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, conversation.agentId),
    });
    if (agent) {
      systemPrompt = agent.systemPrompt;
      agentModel = agent.model;
      agentTemperature = agent.temperature / 100; // stored 0–100, LLM wants 0–1
    }
  }

  // ── Save user message ────────────────────────────────────────
  await saveMessage({
    conversationId,
    role: "user",
    content: userMessage,
  });

  // ── Build SSE stream ─────────────────────────────────────────
  const start = Date.now();
  let fullResponse = "";
  let tokensEstimate = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk));

      try {
        // Classify intent in parallel with loading history
        const [intentResult, history] = await Promise.all([
          classifyIntent(userMessage).catch(() => ({
            intent: "unknown",
            confidence: 0,
            entities: [],
          })),
          loadHistory(conversationId),
        ]);

        const { systemPrompt: builtSystem, messages } = buildPrompt({
          systemPrompt,
          history,
          userMessage,
          language: conversation.language ?? "en",
        });

        // Stream tokens to client
        for await (const token of streamComplete(messages, {
          systemPrompt: builtSystem,
          model: agentModel,
          temperature: agentTemperature,
        })) {
          fullResponse += token;
          tokensEstimate += 1;
          send(formatSSEEvent("token", { token }));
        }

        // Persist assistant response
        await saveMessage({
          conversationId,
          role: "assistant",
          content: fullResponse,
          tokens: tokensEstimate,
        });

        // Log analytics
        await logQuery({
          userId: session.user.id,
          conversationId,
          intent: intentResult.intent,
          latencyMs: Date.now() - start,
          tokensUsed: tokensEstimate,
          resolved: fullResponse.length > 0,
        });

        send(formatSSEEvent("done", { 
          latencyMs: Date.now() - start,
          intent: intentResult.intent,
        }));

      } catch (err) {
        console.error("[stream] Error:", err);
        send(formatSSEEvent("error", {
          message: err instanceof Error ? err.message : "Stream failed",
        }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disables Nginx buffering — critical for SSE
  };
}