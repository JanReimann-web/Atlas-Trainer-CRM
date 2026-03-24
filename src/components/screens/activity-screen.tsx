"use client";

import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard } from "@/components/crm-ui";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function ActivityScreen() {
  const { state } = useCRM();
  const { t, formatDate } = useLocaleContext();

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.activity")} title={t("activity.title")} subtitle={t("activity.subtitle")} />

      <SectionCard title={t("activity.title")}>
        <div className="space-y-3">
          {state.activityEvents.map((event) => (
            <TimelineItem
              key={event.id}
              title={`${event.actor} · ${event.type}`}
              detail={event.detail}
              meta={formatDate(event.createdAt)}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
