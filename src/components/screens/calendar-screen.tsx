"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { EmptyState, SectionCard, StatusBadge } from "@/components/crm-ui";
import { getLocalDateKey } from "@/lib/date";
import { getClient } from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function CalendarScreen() {
  const { state, markReminderDone } = useCRM();
  const { t, formatDate } = useLocaleContext();
  const [nowIso, setNowIso] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNowIso(new Date().toISOString());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const upcomingSessions = [...state.sessions]
    .filter(
      (session) =>
        (session.status === "planned" || session.status === "in-progress") &&
        (!nowIso || session.endAt >= nowIso),
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const sessionsByDay = upcomingSessions.reduce<Record<string, typeof state.sessions>>(
    (acc, session) => {
      const key = getLocalDateKey(session.startAt);
      if (!key) {
        return acc;
      }
      acc[key] = [...(acc[key] ?? []), session];
      return acc;
    },
    {},
  );

  const overdueItems = nowIso
    ? [
        ...state.reminders
          .filter((reminder) => reminder.status === "scheduled" && reminder.dueAt < nowIso)
          .map((reminder) => {
            const client = getClient(state, reminder.clientId);
            const channelLabel =
              reminder.channel === "calendar"
                ? t("common.calendarChannel")
                : t("common.emailChannel");

            return {
              id: `reminder-${reminder.id}`,
              dueAt: reminder.dueAt,
              title: `${reminder.title} / ${client?.fullName ?? ""}`,
              detail: `${t("calendar.overdueReminderDetail")} / ${channelLabel} / ${formatDate(
                reminder.dueAt,
              )}`,
              action: reminder.sessionId ? (
                <Link
                  href={`/clients/${reminder.clientId}/sessions/${reminder.sessionId}`}
                  className="rounded-full bg-[color:var(--sand-2)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                >
                  {t("common.openSession")}
                </Link>
              ) : (
                <Link
                  href={`/clients/${reminder.clientId}`}
                  className="rounded-full bg-[color:var(--sand-2)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                >
                  {t("common.openClient")}
                </Link>
              ),
              complete: (
                <button
                  type="button"
                  onClick={() => markReminderDone(reminder.id)}
                  className="rounded-full bg-[color:var(--ink)] px-3 py-1 text-xs font-semibold text-white"
                >
                  {t("common.done")}
                </button>
              ),
            };
          }),
        ...state.sessions
          .filter((session) => session.status === "completed" && session.endAt < nowIso)
          .flatMap((session) => {
            const client = getClient(state, session.primaryClientId);
            const summaryDraft = [...state.aiDrafts]
              .filter(
                (draft) => draft.sessionId === session.id && draft.type === "workout-summary",
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

            if (summaryDraft?.status === "sent") {
              return [];
            }

            return [
              {
                id: `summary-${session.id}`,
                dueAt: session.endAt,
                title: `${session.title} / ${client?.fullName ?? ""}`,
                detail: summaryDraft
                  ? `${t("calendar.summaryDraftPending")} / ${formatDate(
                      summaryDraft.updatedAt,
                    )}`
                  : `${t("calendar.summaryDraftMissing")} / ${formatDate(session.endAt)}`,
                action: (
                  <Link
                    href={`/clients/${session.primaryClientId}/sessions/${session.id}`}
                    className="rounded-full bg-[color:var(--sand-2)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                  >
                    {t("common.openSession")}
                  </Link>
                ),
                complete: null,
              },
            ];
          }),
      ].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    : [];

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.calendar")} title={t("calendar.title")} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title={t("nav.calendar")} help={t("help.calendar")}>
          {Object.keys(sessionsByDay).length === 0 ? (
            <EmptyState title={t("nav.calendar")} body={t("calendar.upcomingEmpty")} />
          ) : (
            <div className="space-y-4">
              {Object.entries(sessionsByDay)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, sessions]) => (
                  <div
                    key={date}
                    className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                  >
                    <p className="font-semibold text-[color:var(--ink)]">
                      {sessions[0]
                        ? formatDate(sessions[0].startAt, { day: "numeric", month: "long" })
                        : date}
                    </p>
                    <div className="mt-3 space-y-3">
                      {sessions
                        .slice()
                        .sort((a, b) => a.startAt.localeCompare(b.startAt))
                        .map((session) => {
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
          )}
        </SectionCard>

        <SectionCard title={t("calendar.reminderQueue")} help={t("help.calendar")}>
          {overdueItems.length === 0 ? (
            <EmptyState title={t("calendar.reminderQueue")} body={t("calendar.overdueEmpty")} />
          ) : (
            <div className="space-y-3">
              {overdueItems.map((item) => (
                <TimelineItem
                  key={item.id}
                  title={item.title}
                  detail={item.detail}
                  meta={t("status.overdue")}
                  actions={
                    <>
                      {item.action}
                      {item.complete}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
