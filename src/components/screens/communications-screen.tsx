"use client";

import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatusBadge } from "@/components/crm-ui";
import { getClient } from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function CommunicationsScreen() {
  const { state } = useCRM();
  const { t, formatDate } = useLocaleContext();

  return (
    <div className="space-y-6">
      <PageLead
        eyebrow={t("nav.communications")}
        title={t("communications.title")}
        subtitle={t("communications.subtitle")}
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title={t("communications.threads")} help={t("help.communication")}>
          <div className="space-y-4">
            {state.emailThreads.map((thread) => {
              const client = getClient(state, thread.clientId);
              const messages = state.emailMessages
                .filter((message) => message.threadId === thread.id)
                .sort((a, b) => b.sentAt.localeCompare(a.sentAt));

              return (
                <div key={thread.id} className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">{thread.subject}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">{client?.fullName}</p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-ink)]">
                      {formatDate(thread.updatedAt)}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {messages.slice(0, 3).map((message) => (
                      <div key={message.id} className="rounded-2xl bg-[color:var(--sand-2)] p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-[color:var(--ink)]">{message.subject}</p>
                          <StatusBadge status={message.direction === "outbound" ? "sent" : "active"} />
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{message.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title={t("communications.reminders")} help={t("help.communication")}>
          <div className="space-y-3">
            {state.reminders.map((reminder) => {
              const client = getClient(state, reminder.clientId);
              return (
                <TimelineItem
                  key={reminder.id}
                  title={`${reminder.title} · ${client?.fullName ?? ""}`}
                  detail={`${reminder.channel.toUpperCase()} · ${formatDate(reminder.dueAt)}`}
                  meta={reminder.status}
                />
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
