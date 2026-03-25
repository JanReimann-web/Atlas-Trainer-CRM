import { buildNutritionPlanRecommendation } from "@/lib/server/ai";

export async function POST(request: Request) {
  const payload = await request.json();
  const plan = await buildNutritionPlanRecommendation(payload);
  return Response.json({ plan });
}
