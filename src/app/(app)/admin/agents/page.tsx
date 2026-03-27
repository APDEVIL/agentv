import { AuthGuard } from "@/components/shared/auth-guard";
import { AgentForm } from "@/components/admin/agent-form";
import { Separator } from "@/components/ui/separator";

export default function AgentsPage() {
  return (
    <AuthGuard requireAdmin>
      <div className="flex flex-col gap-6 p-6 overflow-auto h-full">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and configure virtual agents
          </p>
        </div>

        <Separator />

        <AgentForm />
      </div>
    </AuthGuard>
  );
}