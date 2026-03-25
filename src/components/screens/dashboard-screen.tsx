"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/crm-ui";
import {
  getClient,
  getMonthlyRevenue,
  getOutstandingRevenue,
  getPackageLiability,
  getSessionsToday,
  getUpcomingSessions,
} from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function DashboardScreen() {
  const { state } = useCRM();
  const { t, formatCurrency, formatDate } = useLocaleContext();
  const openLeads = state.leads.filter((lead) => lead.status !== "converted").length;
  const activeClients = state.clients.length;
  const sessionsToday = getSessionsToday(state);
  const monthlyRevenue = getMonthlyRevenue(state);
  const outstanding = getOutstandingRevenue(state);
  const liability = getPackageLiability(state);
  const upcomingSessions = getUpcomingSessions(state, 4);
  const aiQueue = useMemo(
    () => state.aiDrafts.filter((draft) => draft.status !== "sent").slice(0, 4),
    [state.aiDrafts],
  );

  return (
    <div className="space-y-6">
      <PageLead
        eyebrow={t("nav.dashboard")}
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("dashboard.activeClients")}
          value={String(activeClients)}
          detail={`${state.clients.filter((client) => client.consentStatus === "signed").length} ${t("dashboard.activeClientsDetail")}`}
        />
        <StatCard
          label={t("dashboard.openLeads")}
          value={String(openLeads)}
          detail={`${state.leads.filter((lead) => lead.status === "trial-booked").length} ${t("dashboard.openLeadsDetail")}`}
        />
        <StatCard
          label={t("dashboard.sessionsToday")}
          value={String(sessionsToday.length)}
          detail={
            sessionsToday[0]
              ? `${formatDate(sessionsToday[0].startAt)} / ${t("dashboard.sessionsTodayFirst")}`
              : t("dashboard.sessionsTodayNone")
          }
        />
        <StatCard
          label={t("dashboard.receivedThisMonth")}
          value={formatCurrency(monthlyRevenue)}
          detail={`${formatCurrency(outstanding)} ${t("dashboard.receivedThisMonthDetail")}`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard
          title={t("dashboard.agenda")}
          subtitle={t("dashboard.agendaSubtitle")}
          help={t("help.calendar")}
        >
          <div className="space-y-3">
            {upcomingSessions.map((session) => {
              const client = getClient(state, session.primaryClientId);
              return (
                <Link
                  key={session.id}
                  href={`/clients/${session.primaryClientId}/sessions/${session.id}`}
                  className="block rounded-[24px] border border-[color:var(--line-soft)] bg-white/65 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(34,48,38,0.12)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">{session.title}</p>
                      <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                        {client?.fullName} / {session.location}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={session.status} />
                      <span className="text-sm text-[color:var(--muted-ink)]">
                        {formatDate(session.startAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard
            title={t("dashboard.focusBoard")}
            subtitle={t("dashboard.focusBoardSubtitle")}
            help={t("help.finance")}
          >
            <div className="grid gap-3">
              <TimelineItem
                title={t("dashboard.outstanding")}
                detail={t("dashboard.outstandingDetail")}
                meta={formatCurrency(outstanding)}
              />
              <TimelineItem
                title={t("dashboard.packageLiability")}
                detail={t("dashboard.liabilityDetail")}
                meta={formatCurrency(liability)}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("dashboard.aiQueue")}
            subtitle={t("dashboard.aiQueueSubtitle")}
            help={t("help.aiDrafts")}
          >
            <div className="space-y-3">
              {aiQueue.length === 0 ? (
                <EmptyState title={t("common.none")} body={t("dashboard.aiQueueEmpty")} />
              ) : (
                aiQueue.map((draft) => (
                  <Link
                    key={draft.id}
                    href={
                      draft.sessionId
                        ? `/clients/${draft.clientId}/sessions/${draft.sessionId}`
                        : `/clients/${draft.clientId}`
                    }
                    className="block rounded-[22px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--ink)]">{draft.title}</p>
                        <p className="text-sm text-[color:var(--muted-ink)]">{draft.subject}</p>
                      </div>
                      <StatusBadge status={draft.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
