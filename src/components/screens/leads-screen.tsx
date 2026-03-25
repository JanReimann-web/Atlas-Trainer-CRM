"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatCard, StatusBadge } from "@/components/crm-ui";
import { getLeadCounts } from "@/lib/selectors";
import { PageLead } from "@/components/screens/shared";

export function LeadsScreen() {
  const { state, convertLeadToClient } = useCRM();
  const { t, formatDate } = useLocaleContext();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const counts = getLeadCounts(state);

  const filtered = useMemo(
    () =>
      state.leads.filter((lead) =>
        `${lead.fullName} ${lead.goal} ${lead.source}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase()),
      ),
    [deferredQuery, state.leads],
  );

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.leads")} title={t("leads.title")} subtitle={t("leads.subtitle")} />

      <div className="grid gap-4 md:grid-cols-4">
        {["new", "contacted", "trial-booked", "converted"].map((status) => (
          <StatCard
            key={status}
            label={t(`status.${status}`)}
            value={String(counts[status] ?? 0)}
            detail={
              status === "trial-booked"
                ? t("leads.trialReadyDetail")
                : t("leads.pipelineVisibleDetail")
            }
          />
        ))}
      </div>

      <SectionCard
        title={t("leads.title")}
        subtitle={t("leads.sectionSubtitle")}
        help={t("help.leadStatus")}
        aside={
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t("common.search")}...`}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/80 px-4 py-3 text-sm outline-none md:w-72"
          />
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/70 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-[color:var(--ink)]">{lead.fullName}</p>
                  <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                    {lead.email} / {lead.phone}
                  </p>
                </div>
                <StatusBadge status={lead.status} />
              </div>
              <div className="mt-4 grid gap-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("leads.source")}:</span>{" "}
                  {lead.source}
                </p>
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("leads.goal")}:</span>{" "}
                  {lead.goal}
                </p>
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("leads.nextStep")}:</span>{" "}
                  {lead.nextStep}
                </p>
                <p>{formatDate(lead.lastContactAt)}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => convertLeadToClient(lead.id)}
                  disabled={lead.status === "converted"}
                  className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {lead.status === "converted" ? t("leads.converted") : t("leads.convert")}
                </button>
                <span className="rounded-full bg-[color:var(--sand-2)] px-4 py-2 text-sm text-[color:var(--muted-ink)]">
                  {lead.preferredLanguage.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
