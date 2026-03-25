"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { DataLabel, EmptyState, SectionCard, StatCard, StatusBadge } from "@/components/crm-ui";
import { getLeadCounts } from "@/lib/selectors";
import { CreateLeadInput } from "@/lib/types";
import { PageLead } from "@/components/screens/shared";

const defaultLeadForm: CreateLeadInput = {
  fullName: "",
  email: "",
  phone: "",
  source: "",
  status: "new",
  goal: "",
  nextStep: "",
  preferredLanguage: "en",
  notes: "",
};

const visibleLeadStatuses = ["new", "contacted", "trial-booked"] as const;

export function LeadsScreen() {
  const { state, createLead, updateLeadStatus } = useCRM();
  const { t, formatDate } = useLocaleContext();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CreateLeadInput>(defaultLeadForm);
  const [formError, setFormError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const activeLeads = useMemo(
    () => state.leads.filter((lead) => lead.status !== "converted"),
    [state.leads],
  );
  const counts = getLeadCounts(state);

  const filtered = useMemo(
    () =>
      activeLeads.filter((lead) =>
        `${lead.fullName} ${lead.goal} ${lead.source}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase()),
      ),
    [activeLeads, deferredQuery],
  );

  function updateField<Key extends keyof CreateLeadInput>(key: Key, value: CreateLeadInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.fullName.trim() || !form.email.trim() || !form.goal.trim()) {
      setFormError(t("forms.requiredError"));
      return;
    }

    const email = form.email.trim().toLowerCase();
    if (
      state.leads.some((lead) => lead.email.toLowerCase() === email) ||
      state.clients.some((client) => client.email.toLowerCase() === email)
    ) {
      setFormError(t("forms.duplicateEmail"));
      return;
    }

    createLead({
      ...form,
      fullName: form.fullName.trim(),
      email,
      phone: form.phone.trim(),
      source: form.source.trim(),
      goal: form.goal.trim(),
      nextStep: form.nextStep.trim(),
      notes: form.notes.trim(),
    });

    setForm(defaultLeadForm);
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.leads")} title={t("leads.title")} subtitle={t("leads.subtitle")} />

      <div className="grid gap-4 md:grid-cols-3">
        {visibleLeadStatuses.map((status) => (
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

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SectionCard title={t("forms.leadTitle")} subtitle={t("forms.leadSubtitle")}>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <DataLabel label={t("fields.fullName")}>
                <input
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
              <DataLabel label={t("auth.email")}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DataLabel label={t("fields.phone")}>
                <input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
              <DataLabel label={t("fields.source")}>
                <input
                  value={form.source}
                  onChange={(event) => updateField("source", event.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DataLabel label={t("fields.status")}>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value as CreateLeadInput["status"])}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                >
                  {visibleLeadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </select>
              </DataLabel>
              <DataLabel label={t("fields.preferredLanguage")}>
                <select
                  value={form.preferredLanguage}
                  onChange={(event) =>
                    updateField("preferredLanguage", event.target.value as CreateLeadInput["preferredLanguage"])
                  }
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                >
                  <option value="en">EN</option>
                  <option value="et">ET</option>
                </select>
              </DataLabel>
            </div>

            <DataLabel label={t("fields.goal")}>
              <textarea
                value={form.goal}
                onChange={(event) => updateField("goal", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm leading-6 outline-none"
              />
            </DataLabel>

            <DataLabel label={t("fields.nextStep")}>
              <textarea
                value={form.nextStep}
                onChange={(event) => updateField("nextStep", event.target.value)}
                rows={2}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm leading-6 outline-none"
              />
            </DataLabel>

            <DataLabel label={t("fields.notes")}>
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm leading-6 outline-none"
              />
            </DataLabel>

            {formError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {formError}
              </div>
            ) : null}

            <button
              type="submit"
              className="rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
            >
              {t("forms.leadSubmit")}
            </button>
          </form>
        </SectionCard>

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
          {filtered.length === 0 ? (
            <EmptyState title={t("common.none")} body={t("forms.noSearchResults")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/70 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-[color:var(--ink)]">{lead.fullName}</p>
                      <p className="break-words text-sm leading-6 text-[color:var(--muted-ink)]">
                        {lead.email} / {lead.phone}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={lead.status} />
                    </div>
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
                  <select
                      value={lead.status}
                      onChange={(event) =>
                        updateLeadStatus(lead.id, event.target.value as CreateLeadInput["status"])
                      }
                      className="rounded-full border border-[color:var(--line-soft)] bg-white/90 px-4 py-2 text-sm text-[color:var(--ink)] outline-none"
                    >
                      {visibleLeadStatuses.map((status) => (
                        <option key={status} value={status}>
                          {t(`status.${status}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({
                          fromLead: lead.id,
                          fullName: lead.fullName,
                          email: lead.email,
                          phone: lead.phone,
                          preferredLanguage: lead.preferredLanguage,
                          goal: lead.goal,
                          tagsText: "new-client",
                          notes: lead.notes,
                        });
                        router.push(`/clients?${params.toString()}`);
                      }}
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
          )}
        </SectionCard>
      </div>
    </div>
  );
}
