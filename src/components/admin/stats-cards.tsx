"use client";

import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatMs } from "@/lib/utils";
import {
  MessageSquare,
  Zap,
  Clock,
  TrendingUp,
} from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  description?: string;
  isLoading?: boolean;
}

function StatCard({ title, value, icon: Icon, description, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : (
          <>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface StatsCardsProps {
  days?: number;
}

export function StatsCards({ days = 30 }: StatsCardsProps) {
  const { data, isLoading } = api.analytics.overview.useQuery({ days });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total conversations"
        value={formatNumber(data?.totalConversations ?? 0)}
        icon={MessageSquare}
        description={`Last ${days} days`}
        isLoading={isLoading}
      />
      <StatCard
        title="Total messages"
        value={formatNumber(data?.totalMessages ?? 0)}
        icon={TrendingUp}
        description={`Last ${days} days`}
        isLoading={isLoading}
      />
      <StatCard
        title="Avg response time"
        value={formatMs(data?.avgLatencyMs ?? 0)}
        icon={Clock}
        description="Per query"
        isLoading={isLoading}
      />
      <StatCard
        title="Avg tokens / query"
        value={formatNumber(data?.avgTokensPerQuery ?? 0)}
        icon={Zap}
        description="Input + output"
        isLoading={isLoading}
      />
    </div>
  );
}