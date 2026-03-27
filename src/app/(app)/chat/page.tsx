"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/trpc/react";
import { ConversationList } from "@/components/chat/conversation-list";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus, Bot } from "lucide-react";
import { toast } from "sonner";

export default function ChatPage() {
  const router = useRouter();

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
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="w-64 shrink-0 border-r">
        <ConversationList />
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Bot className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="text-base font-medium">No conversation selected</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pick one from the sidebar or start a new one.
          </p>
        </div>
        <Button
          onClick={() => createConversation.mutate({})}
          disabled={createConversation.isPending}
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          {createConversation.isPending ? "Creating..." : "New conversation"}
        </Button>
      </div>
    </div>
  );
}