"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { DataLabel, EmptyState, SectionCard, StatCard, StatusBadge } from "@/components/crm-ui";
import {
  getConvertedClientsWithFirstSessionBookedCount,
  getLeadCounts,
} from "@/lib/selectors";
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
  const { state, createLead, updateLeadStatus, deleteLead } = useCRM();
  const { t, formatDate, locale } = useLocaleContext();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [form, setForm] = useState<CreateLeadInput>(defaultLeadForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [leadActionError, setLeadActionError] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const activeLeads = useMemo(
    () => state.leads.filter((lead) => lead.status !== "converted"),
    [state.leads],
  );
  const counts = getLeadCounts(state);
  const firstSessionBookedCount = useMemo(
    () => getConvertedClientsWithFirstSessionBookedCount(state),
    [state],
  );

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

    if (!form.fullName.trim() || !form.email.trim()) {
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
      preferredLanguage: locale,
      notes: form.notes.trim(),
    });

    setForm(defaultLeadForm);
    setIsLeadFormOpen(false);
  }

  async function handleLeadDelete(leadId: string, leadName: string) {
    const confirmed = window.confirm(`${t("leads.deleteConfirm")} ${leadName}?`);
    if (!confirmed) {
      return;
    }

    setLeadActionError(null);
    setDeletingLeadId(leadId);

    try {
      await deleteLead(leadId);
    } catch (error) {
      setLeadActionError(
        error instanceof Error ? error.message : t("leads.deleteFailed"),
      );
    } finally {
      setDeletingLeadId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.leads")} title={t("leads.title")} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={t("status.new")} value={String(counts.new ?? 0)} />
        <StatCard label={t("status.contacted")} value={String(counts.contacted ?? 0)} />
        <StatCard
          label={t("leads.firstSessionBooked")}
          value={String(firstSessionBookedCount)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SectionCard title={t("forms.leadTitle")}>
          <button
            type="button"
            onClick={() => setIsLeadFormOpen((current) => !current)}
            className="w-full rounded-full border border-[color:var(--line-soft)] bg-white/75 px-4 py-3 text-sm font-semibold text-[color:var(--ink)] md:hidden"
          >
            {isLeadFormOpen ? t("forms.leadFormClose") : t("forms.leadFormOpen")}
          </button>

          <form
            className={`${isLeadFormOpen ? "mt-4 block" : "mt-4 hidden"} space-y-4 md:mt-0 md:block`}
            onSubmit={handleSubmit}
          >
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

            <div className="grid gap-4 md:grid-cols-1">
              <DataLabel label={t("fields.status")}>
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateField("status", event.target.value as CreateLeadInput["status"])
                  }
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                >
                  {visibleLeadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {t(`status.${status}`)}
                    </option>
                  ))}
                </select>
              </DataLabel>
            </div>

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
          {leadActionError ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {leadActionError}
            </div>
          ) : null}
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
                    {lead.goal ? (
                      <p>
                        <span className="font-semibold text-[color:var(--ink)]">{t("leads.goal")}:</span>{" "}
                        {lead.goal}
                      </p>
                    ) : null}
                    {lead.nextStep ? (
                      <p>
                        <span className="font-semibold text-[color:var(--ink)]">{t("leads.nextStep")}:</span>{" "}
                        {lead.nextStep}
                      </p>
                    ) : null}
                    <p>{formatDate(lead.lastContactAt)}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <select
                      value={lead.status}
                      onChange={(event) =>
                        updateLeadStatus(lead.id, event.target.value as CreateLeadInput["status"])
                      }
                      className="min-w-[180px] rounded-full border border-[color:var(--line-soft)] bg-white/90 px-4 py-2 text-sm text-[color:var(--ink)] outline-none"
                    >
                      {visibleLeadStatuses.map((status) => (
                        <option key={status} value={status}>
                          {t(`status.${status}`)}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const params = new URLSearchParams({
                            fromLead: lead.id,
                            fullName: lead.fullName,
                            email: lead.email,
                            phone: lead.phone,
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
                      <button
                        type="button"
                        onClick={() => void handleLeadDelete(lead.id, lead.fullName)}
                        disabled={deletingLeadId === lead.id}
                        aria-label={t("common.delete")}
                        title={t("common.delete")}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-base leading-none text-rose-900 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        🗑️
                      </button>
                    </div>
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
