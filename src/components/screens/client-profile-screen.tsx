"use client";

import Link from "next/link";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/crm-ui";
import {
  getClient,
  getClientAssessments,
  getClientDrafts,
  getClientMessages,
  getClientNutritionPlans,
  getClientPurchases,
  getClientSessions,
  getClientUpcomingSession,
  getClientWorkoutPlans,
  getPackageTemplate,
  getRemainingUnits,
} from "@/lib/selectors";
import { PageLead } from "@/components/screens/shared";

export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const { state } = useCRM();
  const { t, formatDate, formatCurrency } = useLocaleContext();
  const client = getClient(state, clientId);

  if (!client) {
    return (
      <EmptyState
        title="Client not found"
        body="The requested client profile does not exist in the demo dataset."
      />
    );
  }

  const purchases = getClientPurchases(state, clientId);
  const assessments = getClientAssessments(state, clientId);
  const sessions = getClientSessions(state, clientId);
  const activePlan = getClientWorkoutPlans(state, clientId).find((plan) => plan.status === "active");
  const nutritionPlan = getClientNutritionPlans(state, clientId).find(
    (plan) => plan.status === "active",
  );
  const nextSession = getClientUpcomingSession(state, clientId);
  const drafts = getClientDrafts(state, clientId).slice(0, 3);
  const messages = getClientMessages(state, clientId).slice(0, 4);

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={client.fullName} subtitle={client.notes} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("clients.packageLabel")}
          value={String(purchases[0] ? getRemainingUnits(purchases[0]) : 0)}
          detail={purchases[0] ? `${getPackageTemplate(state, purchases[0].templateId)?.name} active` : "No active package"}
        />
        <StatCard
          label={t("clients.nextSession")}
          value={nextSession ? formatDate(nextSession.startAt, { day: "2-digit", month: "short" }) : "—"}
          detail={nextSession ? nextSession.title : t("clientProfile.noSession")}
        />
        <StatCard
          label={t("clients.activePlan")}
          value={activePlan ? "1" : "0"}
          detail={activePlan?.title ?? "Coach should confirm a new block"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title={t("clientProfile.overview")}
          subtitle={`${client.email} · ${client.phone}`}
          help={t("help.bodyAssessment")}
          aside={
            nextSession ? (
              <Link
                href={`/clients/${client.id}/sessions/${nextSession.id}`}
                className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white"
              >
                {t("clientProfile.openActiveSession")}
              </Link>
            ) : null
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.healthFlags")}</p>
              <div className="mt-3 space-y-3">
                {client.healthFlags.map((flag) => (
                  <div key={flag.title} className="rounded-2xl bg-[color:var(--sand-2)] p-3">
                    <p className="font-medium text-[color:var(--ink)]">{flag.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[color:var(--muted-ink)]">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.latestAssessment")}</p>
              {assessments[0] ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-[color:var(--muted-ink)]">{formatDate(assessments[0].recordedAt)}</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {assessments[0].metrics.map((metric) => (
                      <div key={metric.id} className="rounded-2xl bg-[color:var(--sand-2)] p-3 text-center">
                        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-ink)]">{metric.label}</p>
                        <p className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
                          {metric.value}
                          {metric.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm leading-6 text-[color:var(--muted-ink)]">{assessments[0].notes}</p>
                </div>
              ) : (
                <EmptyState title={t("common.none")} body="No body assessment has been recorded yet." />
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("clientProfile.packages")} help={t("help.packageBalance")}>
          <div className="space-y-3">
            {purchases.map((purchase) => {
              const template = getPackageTemplate(state, purchase.templateId);
              const remainingUnits = getRemainingUnits(purchase);
              return (
                <div key={purchase.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">{template?.name}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">
                        {formatDate(purchase.purchasedAt)} · {formatCurrency(purchase.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={purchase.paymentStatus} />
                      <span className="text-sm font-semibold text-[color:var(--ink)]">
                        {remainingUnits}/{purchase.totalUnits} {t("common.remaining")}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t("clientProfile.workouts")} help={t("help.workoutPlan")}>
          <div className="space-y-4">
            {activePlan ? (
              <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">{activePlan.title}</p>
                    <p className="text-sm leading-6 text-[color:var(--muted-ink)]">{activePlan.goal}</p>
                  </div>
                  <StatusBadge status={activePlan.status} />
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {sessions.slice().reverse().slice(0, 4).map((session) => (
                <Link
                  key={session.id}
                  href={`/clients/${client.id}/sessions/${session.id}`}
                  className="block rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">{session.title}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">{formatDate(session.startAt)}</p>
                    </div>
                    <StatusBadge status={session.status} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("clientProfile.communication")} help={t("help.communication")}>
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-[color:var(--ink)]">{message.subject}</p>
                  <StatusBadge status={message.direction === "outbound" ? "sent" : "active"} />
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{message.body}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("clientProfile.drafts")} help={t("help.aiDrafts")}>
        <div className="grid gap-4 md:grid-cols-3">
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[color:var(--ink)]">{draft.title}</p>
                <StatusBadge status={draft.status} />
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{draft.subject}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {nutritionPlan ? (
        <SectionCard title={t("plans.nutritionPlan")}>
          <div className="grid gap-4 md:grid-cols-5">
            <StatCard label="Calories" value={String(nutritionPlan.calories)} detail="kcal / day" />
            <StatCard label="Protein" value={String(nutritionPlan.proteinGrams)} detail="grams" />
            <StatCard label="Carbs" value={String(nutritionPlan.carbsGrams)} detail="grams" />
            <StatCard label="Fats" value={String(nutritionPlan.fatsGrams)} detail="grams" />
            <StatCard label="Hydration" value={String(nutritionPlan.hydrationLiters)} detail="liters" />
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
