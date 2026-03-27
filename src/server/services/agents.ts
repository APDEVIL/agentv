import { db } from "@/server/db";
import { toolCalls } from "@/server/db/schema";
import { env } from "@/env";
import { complete, buildPrompt, type ChatMessage } from "./ai";
import { searchKnowledge } from "./knowledge";

// ── Tool definitions ───────────────────────────────────────────

export interface ToolInput {
  [key: string]: unknown;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ToolHandler = (input: ToolInput) => Promise<ToolResult>;

// ── Tool registry ──────────────────────────────────────────────

const toolRegistry: Record<string, ToolHandler> = {

  knowledge_base: async (input) => {
    const query = String(input.query ?? "");
    if (!query) return { success: false, error: "query is required" };
    try {
      const results = await searchKnowledge(query);
      return {
        success: true,
        data: results.map((r) => ({ question: r.question, answer: r.answer })),
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  weather: async (input) => {
    const location = String(input.location ?? "");
    if (!location) return { success: false, error: "location is required" };
    if (!env.WEATHER_API_KEY) return { success: false, error: "Weather tool not configured" };
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${env.WEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      const json = await res.json() as {
        main?: { temp: number; humidity: number };
        weather?: { description: string }[];
        name?: string;
      };
      return {
        success: true,
        data: {
          location: json.name,
          temp: json.main?.temp,
          humidity: json.main?.humidity,
          description: json.weather?.[0]?.description,
        },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  web_search: async (input) => {
    const query = String(input.query ?? "");
    if (!query) return { success: false, error: "query is required" };
    if (!env.SERP_API_KEY) return { success: false, error: "Web search tool not configured" };
    try {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${env.SERP_API_KEY}&num=3`;
      const res = await fetch(url);
      const json = await res.json() as {
        organic_results?: { title: string; snippet: string; link: string }[];
      };
      return {
        success: true,
        data: (json.organic_results ?? []).slice(0, 3).map((r) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.link,
        })),
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  escalate: async (input) => {
    const reason = String(input.reason ?? "User requested human agent");
    return {
      success: true,
      data: {
        escalated: true,
        reason,
        message: "A human agent has been notified and will join shortly.",
      },
    };
  },
};

export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry[name] = handler;
}

// ── Run loop ───────────────────────────────────────────────────

export interface RunAgentOptions {
  conversationId: string;
  agentSystemPrompt: string;
  agentTools: string[];
  history: ChatMessage[];
  userMessage: string;
  language?: string;
  model?: string;
  temperature?: number;
}

export interface RunAgentResult {
  response: string;
  tokensUsed: number;
  toolsInvoked: string[];
}

const MAX_TOOL_ROUNDS = 5;

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const allowedTools = opts.agentTools.filter((t) => t in toolRegistry);
  const toolsInvoked: string[] = [];
  const toolResults: string[] = [];
  let totalTokens = 0;

  const toolInstructions =
    allowedTools.length > 0
      ? `\n\nYou have access to these tools. To use one, respond ONLY with JSON:\n` +
        `{"tool": "<tool_name>", "input": {<input_object>}}\n\n` +
        `Available tools:\n${allowedTools.map((t) => `- ${t}`).join("\n")}\n\n` +
        `If you don't need a tool, respond normally in plain text.`
      : "";

  const { systemPrompt, messages } = buildPrompt({
    systemPrompt: opts.agentSystemPrompt + toolInstructions,
    history: opts.history,
    userMessage: opts.userMessage,
    language: opts.language,
    toolResults,
  });

  let currentMessages = messages;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const result = await complete(currentMessages, {
      systemPrompt,
      temperature: (opts.temperature ?? 70) / 100,
      model: opts.model ?? env.GROQ_MODEL,   // ← Groq model default
    });

    totalTokens += result.tokensUsed;

    const toolCall = tryParseToolCall(result.content);

    if (!toolCall || !allowedTools.includes(toolCall.tool)) {
      await logToolCalls(opts.conversationId, toolsInvoked, toolResults);
      return {
        response: result.content,
        tokensUsed: totalTokens,
        toolsInvoked,
      };
    }

    const handler = toolRegistry[toolCall.tool]!;
    const toolResult = await handler(toolCall.input);
    toolsInvoked.push(toolCall.tool);

    const resultSummary = `Tool "${toolCall.tool}" result: ${JSON.stringify(toolResult.data ?? toolResult.error)}`;
    toolResults.push(resultSummary);

    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: result.content },
      {
        role: "user",
        content: `Tool result: ${JSON.stringify(toolResult)}. Now answer the user's original question using this information.`,
      },
    ];
  }

  return {
    response: "I wasn't able to complete this request. Please try again or contact support.",
    tokensUsed: totalTokens,
    toolsInvoked,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function tryParseToolCall(
  content: string
): { tool: string; input: ToolInput } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { tool?: string; input?: ToolInput };
    if (typeof parsed.tool === "string") {
      return { tool: parsed.tool, input: parsed.input ?? {} };
    }
  } catch {
    // not JSON
  }
  return null;
}

async function logToolCalls(
  conversationId: string,
  toolNames: string[],
  results: string[]
): Promise<void> {
  if (toolNames.length === 0) return;
  await db.insert(toolCalls).values(
    toolNames.map((name, i) => ({
      conversationId,
      toolName: name,
      output: { summary: results[i] },
      status: "success" as const,
    }))
  );
}