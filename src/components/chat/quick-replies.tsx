"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickRepliesProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function QuickReplies({ onSelect, disabled }: QuickRepliesProps) {
  const { data: replies, isLoading } = api.chat.quickReplies.useQuery();

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2 px-4 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  if (!replies?.length) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2">
      {replies.map((reply) => (
        <Button
          key={reply.id}
          variant="outline"
          size="sm"
          className="h-7 rounded-full text-xs"
          disabled={disabled}
          onClick={() => onSelect(reply.label)}
        >
          {reply.label}
        </Button>
      ))}
    </div>
  );
}