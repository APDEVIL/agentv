import { AuthGuard } from "@/components/shared/auth-guard";
import { KbTable } from "@/components/admin/kb-table";
import { Separator } from "@/components/ui/separator";

export default function KnowledgePage() {
  return (
    <AuthGuard requireAdmin>
      <div className="flex flex-col gap-6 p-6 overflow-auto h-full">
        <div>
          <h1 className="text-xl font-semibold">Knowledge base</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage FAQ entries the agent uses to answer questions
          </p>
        </div>

        <Separator />

        <KbTable />
      </div>
    </AuthGuard>
  );
}