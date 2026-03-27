import { buildFirstWorkoutRecommendation } from "@/lib/server/ai";

export async function POST(request: Request) {
  const payload = await request.json();
  const workout = await buildFirstWorkoutRecommendation(payload);
  return Response.json({ workout });
}
