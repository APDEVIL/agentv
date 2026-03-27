"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { QuickReplies } from "./quick-replies";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import type { StreamMessage } from "@/hooks/use-chat-stream";

interface ChatWindowProps {
  conversationId: string;
}

export function ChatWindow({ conversationId }: ChatWindowProps) {
  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStream,
    loadInitialMessages,
  } = useChatStream(conversationId);

  // Load existing messages from DB on mount
  const { data: dbMessages, isLoading } = api.chat.getMessages.useQuery(
    { conversationId },
    { refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (dbMessages) {
      const mapped: StreamMessage[] = dbMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        }));
      loadInitialMessages(mapped);
    }
  }, [dbMessages, loadInitialMessages]);

  // Show error toast
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const showQuickReplies = messages.length === 0 && !isLoading;

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1">
        <MessageList messages={messages} isLoading={isLoading} />
      </ScrollArea>

      {/* Quick replies — only on empty conversation */}
      {showQuickReplies && (
        <QuickReplies
          onSelect={(text) => void sendMessage(text)}
          disabled={isStreaming}
        />
      )}

      {/* Input */}
      <MessageInput
        onSend={(msg) => void sendMessage(msg)}
        onStop={stopStream}
        isStreaming={isStreaming}
        disabled={isLoading}
      />
    </div>
  );
}