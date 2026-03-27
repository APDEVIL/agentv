import OpenAI from "openai";
import { env } from "@/env";

// ── Types ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface IntentResult {
  intent: string;
  confidence: number;
  entities: EntityResult[];
}

export interface EntityResult {
  type: string;
  value: string;
  raw: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

// ── Client — Groq via OpenAI-compatible endpoint ───────────────

function getClient() {
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
  });
}

// ── Core completion ────────────────────────────────────────────

export async function complete(
  messages: ChatMessage[],
  options: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<LLMResponse> {
  const client = getClient();
  const model = options.model ?? env.GROQ_MODEL;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1024;

  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(options.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }]
      : []),
    ...messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: allMessages,
  });

  return {
    content: response.choices[0]?.message?.content ?? "",
    tokensUsed: response.usage?.total_tokens ?? 0,
  };
}

// ── Streaming completion ───────────────────────────────────────

export async function* streamComplete(
  messages: ChatMessage[],
  options: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
  } = {}
): AsyncGenerator<string> {
  const client = getClient();
  const model = options.model ?? env.GROQ_MODEL;

  const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(options.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }]
      : []),
    ...messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: options.temperature ?? 0.7,
    messages: allMessages,
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
    ...ctx.history.slice(-20),
    { role: "user", content: ctx.userMessage },
  ];

  return { systemPrompt: system, messages };
}

// ── Token estimator ────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}