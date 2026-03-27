"use client";

import { useRouter, useParams } from "next/navigation";
import { api } from "@/trpc/react";
import { cn, getConversationTitle, formatRelativeTime, truncate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquarePlus, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export function ConversationList() {
  const router = useRouter();
  const params = useParams();
  const activeId = params?.id as string | undefined;

  const { data: conversations, isLoading } = api.chat.listConversations.useQuery(
    { limit: 30 }
  );

  const createConversation = api.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      if (conv) {
        router.push(`/chat/${conv.id}`);
      }
    },
    onError: () => {
      toast.error("Failed to create conversation");
    },
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b">
        <span className="text-sm font-medium">Conversations</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => createConversation.mutate({})}
          disabled={createConversation.isPending}
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 p-2">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-md px-2 py-2">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          ) : conversations?.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No conversations yet.
                <br />
                Start a new one above.
              </p>
            </div>
          ) : (
            conversations?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => router.push(`/chat/${conv.id}`)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent w-full",
                  activeId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "truncate w-full text-xs font-medium",
                    activeId === conv.id
                      ? "text-accent-foreground"
                      : "text-foreground"
                  )}
                >
                  {truncate(getConversationTitle(conv.title), 32)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}