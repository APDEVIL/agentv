import { ChatWindow } from "@/components/chat/chat-window";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: ChatPageProps) {
  const { id } = await params;

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="w-64 shrink-0 border-r">
        {/* Dynamically imported to keep sidebar client-side */}
        <ConversationListClient />
      </div>

      {/* Chat window */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatWindow conversationId={id} />
      </div>
    </div>
  );
}

// Thin client wrapper so the server page stays async
function ConversationListClient() {
  "use client";
  const { ConversationList } = require("@/components/chat/conversation-list") as {
    ConversationList: React.ComponentType;
  };
  return <ConversationList />;
}