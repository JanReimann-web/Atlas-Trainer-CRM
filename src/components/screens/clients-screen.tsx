"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatusBadge } from "@/components/crm-ui";
import {
  getClientPurchases,
  getClientUpcomingSession,
  getClientWorkoutPlans,
  getRemainingUnits,
} from "@/lib/selectors";
import { PageLead } from "@/components/screens/shared";

export function ClientsScreen() {
  const { state } = useCRM();
  const { t, formatDate } = useLocaleContext();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filteredClients = useMemo(
    () =>
      state.clients.filter((client) =>
        `${client.fullName} ${client.goals.join(" ")} ${client.tags.join(" ")}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase()),
      ),
    [deferredQuery, state.clients],
  );

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={t("clients.title")} subtitle={t("clients.subtitle")} />

      <SectionCard
        title={t("clients.title")}
        subtitle="Each client card links into a full profile with packages, plans, assessments, and communication."
        aside={
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t("common.search")}...`}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/80 px-4 py-3 text-sm outline-none md:w-72"
          />
        }
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => {
            const nextSession = getClientUpcomingSession(state, client.id);
            const packagePurchase = getClientPurchases(state, client.id)[0];
            const remainingUnits = packagePurchase ? getRemainingUnits(packagePurchase) : 0;
            const activePlan = getClientWorkoutPlans(state, client.id).find(
              (plan) => plan.status === "active",
            );

            return (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="panel-surface rounded-[28px] p-5 transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-14 w-14 rounded-[20px]"
                      style={{
                        background: `linear-gradient(135deg, hsl(${client.avatarHue} 78% 75%), hsl(${client.avatarHue + 30} 82% 58%))`,
                      }}
                    />
                    <div>
                      <p className="text-lg font-semibold text-[color:var(--ink)]">{client.fullName}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">{client.tags.join(" · ")}</p>
                    </div>
                  </div>
                  <StatusBadge status={client.consentStatus} />
                </div>

                <div className="mt-5 grid gap-3 text-sm leading-6 text-[color:var(--muted-ink)]">
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">{t("clients.packageLabel")}:</span>{" "}
                    {remainingUnits} {t("common.remaining")}
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">{t("clients.nextSession")}:</span>{" "}
                    {nextSession ? formatDate(nextSession.startAt) : "No date yet"}
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink)]">{t("clients.activePlan")}:</span>{" "}
                    {activePlan?.title ?? "No active plan"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
