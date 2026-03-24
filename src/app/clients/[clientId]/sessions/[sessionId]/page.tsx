import { WorkoutSessionScreen } from "@/components/workout-session-screen";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ clientId: string; sessionId: string }>;
}) {
  const { clientId, sessionId } = await params;
  return <WorkoutSessionScreen clientId={clientId} sessionId={sessionId} />;
}
