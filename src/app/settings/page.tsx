import { SettingsScreen } from "@/components/screens/settings-screen";
import { getIntegrationHealth } from "@/lib/server/integrations";

export default function SettingsPage() {
  return <SettingsScreen integrationHealth={getIntegrationHealth()} />;
}
