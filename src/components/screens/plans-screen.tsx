"use client";

import { useState, useTransition } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { DataLabel, SectionCard } from "@/components/crm-ui";
import {
  getClient,
  getClientAssessments,
  getClientSessions,
  getClientWorkoutPlans,
} from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function PlansScreen() {
  const { state, upsertDraft } = useCRM();
  const { t, locale, formatDate } = useLocaleContext();
  const [selectedClientId, setSelectedClientId] = useState(state.clients[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const selectedClient = getClient(state, selectedClientId) ?? state.clients[0];

  async function generate(kind: "workout" | "nutrition") {
    if (!selectedClient) return;

    const workoutPlan = getClientWorkoutPlans(state, selectedClient.id).find(
      (plan) => plan.status === "active",
    );
    const assessments = getClientAssessments(state, selectedClient.id);
    const sessions = getClientSessions(state, selectedClient.id);

    const response = await fetch("/api/ai/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        kind,
        client: selectedClient,
        currentWorkoutPlan: workoutPlan,
        recentAssessments: assessments,
        recentSessions: sessions,
      }),
    });

    const payload = (await response.json()) as {
      draft: Parameters<typeof upsertDraft>[0];
    };

    startTransition(() => upsertDraft(payload.draft));
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.plans")} title={t("plans.title")} subtitle={t("plans.subtitle")} />

      <SectionCard
        title={t("nav.plans")}
        subtitle="Choose a client, then generate either a workout block draft or a nutrition draft."
        help={t("help.workoutPlan")}
      >
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <DataLabel label="Client">
              <select
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
              >
                {state.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.fullName}
                  </option>
                ))}
              </select>
            </DataLabel>
            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => void generate("workout")}
                className="rounded-[22px] bg-[color:var(--ink)] px-4 py-4 text-sm font-semibold text-white"
              >
                {isPending ? "..." : t("plans.generateWorkout")}
              </button>
              <button
                type="button"
                onClick={() => void generate("nutrition")}
                className="rounded-[22px] bg-[color:var(--clay)] px-4 py-4 text-sm font-semibold text-white"
              >
                {isPending ? "..." : t("plans.generateNutrition")}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {selectedClient ? (
              <>
                <TimelineItem
                  title={selectedClient.fullName}
                  detail={selectedClient.goals.join(" · ")}
                  meta={selectedClient.preferredLanguage.toUpperCase()}
                />
                {getClientWorkoutPlans(state, selectedClient.id).map((plan) => (
                  <TimelineItem
                    key={plan.id}
                    title={`${t("plans.workoutBlock")} · ${plan.title}`}
                    detail={plan.goal}
                    meta={formatDate(plan.updatedAt)}
                  />
                ))}
              </>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
