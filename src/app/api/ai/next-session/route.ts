import { buildNextSessionDraft } from "@/lib/server/ai";

export async function POST(request: Request) {
  const payload = await request.json();
  const draft = await buildNextSessionDraft(payload);
  return Response.json({ draft });
}
