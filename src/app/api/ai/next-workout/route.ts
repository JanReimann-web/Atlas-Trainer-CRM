import { buildNextWorkoutRecommendation } from "@/lib/server/ai";

export async function POST(request: Request) {
  const payload = await request.json();
  const workout = await buildNextWorkoutRecommendation(payload);
  return Response.json({ workout });
}
