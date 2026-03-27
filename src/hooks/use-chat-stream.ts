"use client";

import { useState, useCallback, useRef } from "react";

export interface StreamMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  createdAt: Date;
}

export function useChatStream(conversationId: string) {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !content.trim()) return;

      setError(null);
      setIntent(null);

      const userMsg: StreamMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        createdAt: new Date(),
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: StreamMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        isStreaming: true,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      abortRef.current = new AbortController();

      try {
        const res = await fetch(`/api/stream/${conversationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content.trim() }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`Stream failed with status ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const parsed = JSON.parse(line.slice(6)) as {
                event: "token" | "done" | "error";
                payload: unknown;
              };

              if (parsed.event === "token") {
                const token = (parsed.payload as { token: string }).token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + token }
                      : m
                  )
                );
              }

              if (parsed.event === "done") {
                const payload = parsed.payload as {
                  latencyMs?: number;
                  intent?: string;
                };
                if (payload.intent) setIntent(payload.intent);
                break;
              }

              if (parsed.event === "error") {
                throw new Error("Stream error from server");
              }
            } catch {
              // malformed SSE line — skip
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setError("Failed to send message. Please try again.");

        // Remove the failed assistant placeholder
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
        setIsStreaming(false);
      }
    },
    [conversationId, isStreaming]
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const loadInitialMessages = useCallback(
    (initial: StreamMessage[]) => {
      setMessages(initial);
    },
    []
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIntent(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    intent,
    sendMessage,
    stopStream,
    loadInitialMessages,
    clearMessages,
  };
}