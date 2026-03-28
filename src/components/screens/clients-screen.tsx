"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useDeferredValue, useMemo, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  DataLabel,
  EmptyState,
  MobileAccordionToggle,
  SectionCard,
} from "@/components/crm-ui";
import {
  getClientPurchases,
  getClientUpcomingSession,
  getClientWorkoutPlans,
  getRemainingUnits,
} from "@/lib/selectors";
import { CreateClientInput, HealthFlag } from "@/lib/types";
import { PageLead } from "@/components/screens/shared";

const defaultClientForm = {
  fullName: "",
  email: "",
  phone: "",
  gender: "unspecified",
  goalsText: "",
  notes: "",
  healthFlagsText: "",
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHealthFlags(value: string): HealthFlag[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...detailParts] = line.split("|");
      return {
        title: title.trim(),
        detail: detailParts.join("|").trim() || title.trim(),
        severity: "attention" as const,
      };
    })
    .filter((flag) => flag.title && flag.detail);
}

export function ClientsScreen() {
  const { state, createClient, createClientFromLead } = useCRM();
  const { t, formatDate, locale } = useLocaleContext();
  const searchParams = useSearchParams();
  const fromLeadId = searchParams.get("fromLead");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(() => ({
    ...defaultClientForm,
    fullName: searchParams.get("fullName") ?? "",
    email: searchParams.get("email") ?? "",
    phone: searchParams.get("phone") ?? "",
    goalsText: searchParams.get("goal") ?? "",
    notes: searchParams.get("notes") ?? "",
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
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

  function updateField<Key extends keyof typeof defaultClientForm>(
    key: Key,
    value: (typeof defaultClientForm)[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.fullName.trim() || !form.email.trim() || !form.goalsText.trim()) {
      setFormError(t("forms.requiredError"));
      return;
    }

    const email = form.email.trim().toLowerCase();
    const fromLead = fromLeadId ? state.leads.find((lead) => lead.id === fromLeadId) : null;
    if (state.clients.some((client) => client.email.toLowerCase() === email)) {
      setFormError(t("forms.duplicateEmail"));
      return;
    }

    if (
      state.leads.some(
        (lead) =>
          lead.email.toLowerCase() === email &&
          (!fromLead || lead.id !== fromLead.id),
      )
    ) {
      setFormError(t("forms.duplicateEmail"));
      return;
    }

    const input: CreateClientInput = {
      fullName: form.fullName.trim(),
      email,
      phone: form.phone.trim(),
      gender: form.gender,
      preferredLanguage:
        fromLead?.preferredLanguage ?? (locale as CreateClientInput["preferredLanguage"]),
      goals: splitCsv(form.goalsText),
      tags: [],
      consentStatus: "signed",
      notes: form.notes.trim(),
      healthFlags: parseHealthFlags(form.healthFlagsText),
    };

    if (fromLead) {
      createClientFromLead(fromLead.id, input);
    } else {
      createClient(input);
    }
    setForm(defaultClientForm);
    setIsClientFormOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={t("clients.title")} />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <SectionCard title={t("forms.clientTitle")}>
          <MobileAccordionToggle
            isOpen={isClientFormOpen}
            onToggle={() => setIsClientFormOpen((current) => !current)}
          />

          <div className={`${isClientFormOpen ? "mt-4 block" : "hidden md:mt-4 md:block"}`}>
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
              <DataLabel label={t("fields.gender")}>
                <input
                  value={form.gender}
                  onChange={(event) => updateField("gender", event.target.value)}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
            </div>

            <DataLabel label={t("fields.goals")}>
              <textarea
                value={form.goalsText}
                onChange={(event) => updateField("goalsText", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/85 px-4 py-3 text-sm leading-6 outline-none"
              />
            </DataLabel>

            <DataLabel label={t("fields.healthFlags")}>
              <textarea
                value={form.healthFlagsText}
                onChange={(event) => updateField("healthFlagsText", event.target.value)}
                rows={3}
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
              {t("forms.clientSubmit")}
            </button>
          </form>
          </div>
        </SectionCard>

        <SectionCard
          title={t("clients.title")}
          aside={
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`${t("common.search")}...`}
              className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/80 px-4 py-3 text-sm outline-none md:w-72"
            />
          }
        >
          {filteredClients.length === 0 ? (
            <EmptyState title={t("common.none")} body={t("forms.noSearchResults")} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2">
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
                      <div className="flex min-w-0 items-center gap-4">
                        <div
                          className="h-14 w-14 shrink-0 rounded-[20px]"
                          style={{
                            background: `linear-gradient(135deg, hsl(${client.avatarHue} 78% 75%), hsl(${client.avatarHue + 30} 82% 58%))`,
                          }}
                        />
                        <div className="min-w-0">
                          <p className="break-words text-lg font-semibold text-[color:var(--ink)]">
                            {client.fullName}
                          </p>
                          <p className="break-words text-sm text-[color:var(--muted-ink)]">
                            {client.tags.join(" / ") || t("common.none")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 text-sm leading-6 text-[color:var(--muted-ink)]">
                      <p>
                        <span className="font-semibold text-[color:var(--ink)]">{t("clients.packageLabel")}:</span>{" "}
                        {remainingUnits} {t("common.remaining")}
                      </p>
                      <p>
                        <span className="font-semibold text-[color:var(--ink)]">{t("clients.nextSession")}:</span>{" "}
                        {nextSession ? formatDate(nextSession.startAt) : t("common.noDateYet")}
                      </p>
                      <p>
                        <span className="font-semibold text-[color:var(--ink)]">{t("clients.activePlan")}:</span>{" "}
                        {activePlan?.title ?? t("common.noActivePlan")}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
