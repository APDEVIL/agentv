import { AuthGuard } from "@/components/shared/auth-guard";
import { StatsCards } from "@/components/admin/stats-cards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default function AdminPage() {
  return (
    <AuthGuard requireAdmin>
      <div className="flex flex-col gap-6 p-6 overflow-auto h-full">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Usage analytics and system health
          </p>
        </div>

        <Separator />

        {/* Time range tabs */}
        <Tabs defaultValue="30">
          <TabsList>
            <TabsTrigger value="7">7 days</TabsTrigger>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>

          <TabsContent value="7" className="mt-4">
            <StatsCards days={7} />
          </TabsContent>
          <TabsContent value="30" className="mt-4">
            <StatsCards days={30} />
          </TabsContent>
          <TabsContent value="90" className="mt-4">
            <StatsCards days={90} />
          </TabsContent>
        </Tabs>

        {/* Health status */}
        <HealthStatus />
      </div>
    </AuthGuard>
  );
}

function HealthStatus() {
  "use client";
  const { api } = require("@/trpc/react") as { api: typeof import("@/trpc/react").api };
  const { data } = api.admin.health.useQuery(undefined, {
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm font-medium mb-3">System health</p>
      <div className="flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            data?.db === "ok" ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-sm text-muted-foreground">
          Database —{" "}
          <span className={data?.db === "ok" ? "text-green-600" : "text-red-600"}>
            {data?.db ?? "checking..."}
          </span>
        </span>
      </div>
    </div>
  );
}