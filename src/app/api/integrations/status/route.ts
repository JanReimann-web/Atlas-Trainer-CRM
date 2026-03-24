import { getIntegrationHealth } from "@/lib/server/integrations";

export async function GET() {
  return Response.json({ integrations: getIntegrationHealth() });
}
