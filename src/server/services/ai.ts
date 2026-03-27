import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import { env } from "@/env";

// ── Types ─────────────────────────────────────────────────────

export type LLMProvider = "anthropic" | "openai";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface IntentResult {
  intent: string;         // e.g. "pricing_query", "technical_support", "greeting"
  confidence: number;     // 0–1
  entities: EntityResult[];
}

export interface EntityResult {
  type: string;           // e.g. "product", "date", "location", "person"
  value: string;
  raw: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  provider: LLMProvider;
}

// ── Client factory ─────────────────────────────────────────────

function getAnthropicClient() {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function getOpenAIClient() {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

/** Pick provider based on env — Anthropic preferred, OpenAI fallback */
function getProvider(): LLMProvider {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  throw new Error("No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
}

// ── Core completion ────────────────────────────────────────────

export async function complete(
  messages: ChatMessage[],
  options: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;   // 0–1
    maxTokens?: number;
    provider?: LLMProvider;
  } = {}
): Promise<LLMResponse> {
  const provider = options.provider ?? getProvider();
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1024;

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const model = options.model ?? "claude-sonnet-4-20250514";

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: options.systemPrompt,
      temperature,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });

    const content =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return {
      content,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      provider: "anthropic",
    };
  }

  // OpenAI
  const client = getOpenAIClient();
  const model = options.model ?? "gpt-4o";
  const allMessages = options.systemPrompt
    ? [{ role: "system" as const, content: options.systemPrompt }, ...messages]
    : messages;

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
    provider: "openai",
  };
}

// ── Streaming completion ───────────────────────────────────────

export async function* streamComplete(
  messages: ChatMessage[],
  options: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    provider?: LLMProvider;
  } = {}
): AsyncGenerator<string> {
  const provider = options.provider ?? getProvider();

  if (provider === "anthropic") {
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: options.model ?? "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: options.systemPrompt,
      temperature: options.temperature ?? 0.7,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
    return;
  }

  // OpenAI streaming
  const client = getOpenAIClient();
  const allMessages = options.systemPrompt
    ? [{ role: "system" as const, content: options.systemPrompt }, ...messages]
    : messages;

  const stream = await client.chat.completions.create({
    model: options.model ?? "gpt-4o",
    max_tokens: 1024,
    temperature: options.temperature ?? 0.7,
    messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Intent classification ──────────────────────────────────────

export async function classifyIntent(userMessage: string): Promise<IntentResult> {
  const systemPrompt = `You are an intent classifier. Given a user message, respond ONLY with valid JSON.
Return exactly this shape:
{
  "intent": "<snake_case_intent_name>",
  "confidence": <0.0 to 1.0>,
  "entities": [
    { "type": "<entity_type>", "value": "<normalised_value>", "raw": "<as_written>" }
  ]
}

Common intents: greeting, farewell, pricing_query, technical_support, order_status,
account_help, product_info, complaint, escalation_request, out_of_scope.

Entity types: product, date, location, person, order_id, email, phone.`;

  const result = await complete(
    [{ role: "user", content: userMessage }],
    { systemPrompt, maxTokens: 256, temperature: 0.1 }
  );

  try {
    return JSON.parse(result.content) as IntentResult;
  } catch {
    return { intent: "out_of_scope", confidence: 0.5, entities: [] };
  }
}

// ── Prompt builder ─────────────────────────────────────────────

export interface PromptContext {
  systemPrompt: string;
  history: ChatMessage[];
  userMessage: string;
  knowledgeSnippets?: string[];
  toolResults?: string[];
  language?: string;
}

/** Assemble the full message array for an agent turn */
export function buildPrompt(ctx: PromptContext): {
  systemPrompt: string;
  messages: ChatMessage[];
} {
  let system = ctx.systemPrompt;

  if (ctx.language && ctx.language !== "en") {
    system += `\n\nAlways respond in the user's language: ${ctx.language}.`;
  }

  if (ctx.knowledgeSnippets?.length) {
    system += `\n\nRelevant knowledge base context:\n${ctx.knowledgeSnippets
      .map((s, i) => `[${i + 1}] ${s}`)
      .join("\n")}`;
  }

  if (ctx.toolResults?.length) {
    system += `\n\nTool results from this turn:\n${ctx.toolResults.join("\n")}`;
  }

  const messages: ChatMessage[] = [
    ...ctx.history.slice(-20), // keep last 20 messages for context window
    { role: "user", content: ctx.userMessage },
  ];

  return { systemPrompt: system, messages };
}

// ── Token counter (rough estimate — use tiktoken for precision) ─

export function estimateTokens(text: string): number {
  // ~4 chars per token is a good approximation for English
  return Math.ceil(text.length / 4);
}