import { buildAdaptivePlanDraft } from "@/lib/server/ai";

export async function POST(request: Request) {
  const payload = await request.json();
  const draft = await buildAdaptivePlanDraft(payload);
  return Response.json({ draft });
}
