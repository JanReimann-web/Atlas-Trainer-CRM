"use client";

import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatusBadge } from "@/components/crm-ui";
import { PageLead, TimelineItem } from "@/components/screens/shared";
import { IntegrationHealth } from "@/lib/types";

const integrationDetailKey: Record<string, string> = {
  Firebase: "settings.integrationFirebaseDetail",
  OpenAI: "settings.integrationOpenAIDetail",
  "Microsoft Graph": "settings.integrationMicrosoftDetail",
};

export function SettingsScreen({
  integrationHealth,
}: {
  integrationHealth: IntegrationHealth[];
}) {
  const { state } = useCRM();
  const { t, locale } = useLocaleContext();

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.settings")} title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t("settings.integrations")} help={t("help.integrations")}>
          <div className="space-y-3">
            {integrationHealth.map((service) => (
              <div key={service.name} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">{service.name}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                      {t(integrationDetailKey[service.name] ?? service.detail)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[color:var(--muted-ink)]">
                      {service.envKeys.join(" / ")}
                    </p>
                  </div>
                  <StatusBadge status={service.state} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard title={t("settings.packageCatalog")}>
            <div className="space-y-3">
              {state.packageTemplates.map((template) => (
                <TimelineItem
                  key={template.id}
                  title={template.name}
                  detail={`${template.sessionCount} ${t("settings.packageSession")} / ${t("settings.packageUpTo")} ${template.maxParticipants} ${template.maxParticipants === 1 ? t("settings.packagePerson") : t("settings.packagePeople")}`}
                  meta={`${template.price} EUR`}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t("settings.translation")}>
            <div className="rounded-[24px] bg-white/60 p-4 text-sm leading-6 text-[color:var(--muted-ink)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[color:var(--ink)]">{locale.toUpperCase()}</p>
                <StatusBadge status="ready" />
              </div>
              <p className="mt-2">{t("settings.translationNote")}</p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
