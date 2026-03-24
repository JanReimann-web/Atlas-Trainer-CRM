import { IntegrationHealth } from "@/lib/types";

function hasEnv(keys: string[]) {
  return keys.every((key) => {
    const value = process.env[key];
    return Boolean(value && value.trim().length > 0);
  });
}

export function getIntegrationHealth(): IntegrationHealth[] {
  const services: IntegrationHealth[] = [
    {
      name: "Firebase",
      configured: hasEnv([
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      ]),
      state: "pending",
      detail:
        "Firebase Auth and Firestore persistence are wired into the app. Storage is configured and ready for client files when file uploads are added.",
      envKeys: [
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      ],
    },
    {
      name: "OpenAI",
      configured: hasEnv(["OPENAI_API_KEY"]),
      state: "pending",
      detail:
        "AI routes run server-side and now call the configured OpenAI model, while keeping deterministic fallbacks if the API is unavailable.",
      envKeys: ["OPENAI_API_KEY", "OPENAI_MODEL"],
    },
    {
      name: "Microsoft Graph",
      configured: hasEnv([
        "MICROSOFT_CLIENT_ID",
        "MICROSOFT_CLIENT_SECRET",
        "MICROSOFT_TENANT_ID",
      ]),
      state: "pending",
      detail:
        "Outlook email and calendar sync are modeled in the UI and server layer. Add Microsoft app credentials to enable live Graph calls.",
      envKeys: [
        "MICROSOFT_CLIENT_ID",
        "MICROSOFT_CLIENT_SECRET",
        "MICROSOFT_TENANT_ID",
      ],
    },
  ];

  return services.map((service) => ({
    ...service,
    state: service.configured ? "ready" : "pending",
  }));
}
