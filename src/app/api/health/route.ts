import { getHealth } from "@/server/services/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await getHealth();

  const status = health.status === "ok" ? 200 : 503;

  return Response.json(health, { status });
}