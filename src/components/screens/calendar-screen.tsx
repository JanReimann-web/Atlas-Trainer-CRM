"use client";

import Link from "next/link";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatusBadge } from "@/components/crm-ui";
import { getClient } from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function CalendarScreen() {
  const { state, markReminderDone } = useCRM();
  const { t, formatDate } = useLocaleContext();

  const sessionsByDay = state.sessions.reduce<Record<string, typeof state.sessions>>(
    (acc, session) => {
      const key = session.startAt.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), session];
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.calendar")} title={t("calendar.title")} subtitle={t("calendar.subtitle")} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title={t("nav.calendar")} help={t("help.calendar")}>
          <div className="space-y-4">
            {Object.entries(sessionsByDay)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, sessions]) => (
                <div
                  key={date}
                  className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                >
                  <p className="font-semibold text-[color:var(--ink)]">
                    {formatDate(`${date}T00:00:00.000Z`, { day: "numeric", month: "long" })}
                  </p>
                  <div className="mt-3 space-y-3">
                    {sessions.map((session) => {
                      const client = getClient(state, session.primaryClientId);
                      return (
                        <Link
                          key={session.id}
                          href={`/clients/${session.primaryClientId}/sessions/${session.id}`}
                          className="block rounded-[22px] bg-[color:var(--sand-2)] p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[color:var(--ink)]">{session.title}</p>
                              <p className="text-sm text-[color:var(--muted-ink)]">{client?.fullName}</p>
                            </div>
                            <div className="space-x-2">
                              <StatusBadge status={session.status} />
                              <StatusBadge status={session.calendarSync} />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </SectionCard>

        <SectionCard title={t("calendar.reminderQueue")} help={t("help.calendar")}>
          <div className="space-y-3">
            {state.reminders.map((reminder) => {
              const client = getClient(state, reminder.clientId);
              const channelLabel =
                reminder.channel === "calendar"
                  ? t("common.calendarChannel")
                  : t("common.emailChannel");

              return (
                <TimelineItem
                  key={reminder.id}
                  title={`${reminder.title} / ${client?.fullName ?? ""}`}
                  detail={`${channelLabel} / ${formatDate(reminder.dueAt)}`}
                  meta={t(`status.${reminder.status}`)}
                  actions={
                    reminder.status !== "done" ? (
                      <button
                        type="button"
                        onClick={() => markReminderDone(reminder.id)}
                        className="rounded-full bg-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-white"
                      >
                        {t("common.done")}
                      </button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
