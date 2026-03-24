import { ClientProfileScreen } from "@/components/screens/client-profile-screen";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientProfileScreen clientId={clientId} />;
}
