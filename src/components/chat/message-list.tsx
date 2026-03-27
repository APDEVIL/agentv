"use client";

import { useEffect, useRef } from "react";
import { cn, formatTime, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import type { StreamMessage } from "@/hooks/use-chat-stream";

interface MessageListProps {
  messages: StreamMessage[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const { user } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3",
              i % 2 === 0 ? "flex-row" : "flex-row-reverse"
            )}
          >
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Bot className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">How can I help you today?</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ask me anything or pick a quick reply below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {messages.map((msg) => {
        const isUser = msg.role === "user";

        return (
          <div
            key={msg.id}
            className={cn(
              "flex items-start gap-3",
              isUser ? "flex-row-reverse" : "flex-row"
            )}
          >
            {/* Avatar */}
            {isUser ? (
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.image ?? ""} />
                <AvatarFallback className="text-xs">
                  {getInitials(user?.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={cn(
                "flex flex-col gap-1 max-w-[75%]",
                isUser ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                )}
              >
                {msg.content || (
                  // Streaming cursor
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                  </span>
                )}
                {msg.isStreaming && msg.content && (
                  <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle" />
                )}
              </div>
              <span className="text-[11px] text-muted-foreground px-1">
                {formatTime(msg.createdAt)}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}