"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  DataLabel,
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
import {
  ClientProfile,
  CreateBodyAssessmentInput,
  CreateClientInput,
  CreatePackagePurchaseInput,
  HealthFlag,
} from "@/lib/types";
import { PageLead } from "@/components/screens/shared";

function dateInputValue(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoFromDate(date: string, hour: number) {
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

const defaultClientProfileForm = {
  fullName: "",
  email: "",
  phone: "",
  gender: "unspecified",
  preferredLanguage: "en",
  goalsText: "",
  tagsText: "",
  consentStatus: "pending",
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

function stringifyHealthFlags(flags: HealthFlag[]) {
  return flags.map((flag) => `${flag.title} | ${flag.detail}`).join("\n");
}

function buildClientProfileForm(client?: ClientProfile | null) {
  if (!client) {
    return defaultClientProfileForm;
  }

  return {
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    gender: client.gender,
    preferredLanguage: client.preferredLanguage,
    goalsText: client.goals.join(", "),
    tagsText: client.tags.join(", "),
    consentStatus: client.consentStatus,
    notes: client.notes,
    healthFlagsText: stringifyHealthFlags(client.healthFlags),
  };
}

export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const { state, addPackagePurchase, addBodyAssessment, updateClient } = useCRM();
  const { t, formatDate, formatCurrency } = useLocaleContext();
  const client = getClient(state, clientId);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(() => buildClientProfileForm(client));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [packageForm, setPackageForm] = useState({
    templateId: state.packageTemplates[0]?.id ?? "",
    purchasedDate: dateInputValue(),
    startsDate: dateInputValue(),
    expiresDate: dateInputValue(60),
    paymentStatus: "pending",
    amountPaid: "",
    notes: "",
  });
  const [assessmentForm, setAssessmentForm] = useState({
    recordedDate: dateInputValue(),
    notes: "",
    metrics: [
      { label: "", value: "", unit: "" },
      { label: "", value: "", unit: "" },
      { label: "", value: "", unit: "" },
    ],
  });
  const [packageError, setPackageError] = useState<string | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  if (!client) {
    return <EmptyState title={t("clientProfile.missingTitle")} body={t("clientProfile.missingBody")} />;
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

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError(null);

    if (!client) {
      return;
    }

    if (!profileForm.fullName.trim() || !profileForm.email.trim() || !profileForm.goalsText.trim()) {
      setProfileError(t("forms.requiredError"));
      return;
    }

    const email = profileForm.email.trim().toLowerCase();
    if (state.clients.some((item) => item.id !== client.id && item.email.toLowerCase() === email)) {
      setProfileError(t("forms.duplicateEmail"));
      return;
    }

    if (
      state.leads.some(
        (lead) => lead.status !== "converted" && lead.email.toLowerCase() === email,
      )
    ) {
      setProfileError(t("forms.duplicateEmail"));
      return;
    }

    const input: CreateClientInput = {
      fullName: profileForm.fullName.trim(),
      email,
      phone: profileForm.phone.trim(),
      gender: profileForm.gender.trim() || "unspecified",
      preferredLanguage: profileForm.preferredLanguage as CreateClientInput["preferredLanguage"],
      goals: splitCsv(profileForm.goalsText),
      tags: splitCsv(profileForm.tagsText),
      consentStatus: profileForm.consentStatus as CreateClientInput["consentStatus"],
      notes: profileForm.notes.trim(),
      healthFlags: parseHealthFlags(profileForm.healthFlagsText),
    };

    updateClient(client.id, input);
    setProfileForm(
      buildClientProfileForm({
        ...client,
        ...input,
      }),
    );
    setEditingProfile(false);
  }

  function submitPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPackageError(null);

    if (
      !packageForm.templateId ||
      !packageForm.purchasedDate ||
      !packageForm.startsDate ||
      !packageForm.expiresDate
    ) {
      setPackageError(t("forms.requiredError"));
      return;
    }

    const template = state.packageTemplates.find((item) => item.id === packageForm.templateId);
    const amountPaid =
      packageForm.paymentStatus === "paid"
        ? template?.price ?? 0
        : Number(packageForm.amountPaid || 0);

    if (packageForm.paymentStatus === "partial" && amountPaid <= 0) {
      setPackageError(t("forms.requiredError"));
      return;
    }

    const input: CreatePackagePurchaseInput = {
      clientId,
      templateId: packageForm.templateId,
      purchasedAt: isoFromDate(packageForm.purchasedDate, 9),
      startsAt: isoFromDate(packageForm.startsDate, 9),
      expiresAt: isoFromDate(packageForm.expiresDate, 21),
      paymentStatus: packageForm.paymentStatus as CreatePackagePurchaseInput["paymentStatus"],
      amountPaid,
      notes: packageForm.notes.trim(),
    };

    addPackagePurchase(input);
    setPackageForm((current) => ({
      ...current,
      paymentStatus: "pending",
      amountPaid: "",
      notes: "",
    }));
  }

  function submitAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssessmentError(null);

    if (!assessmentForm.recordedDate) {
      setAssessmentError(t("forms.requiredError"));
      return;
    }

    const metrics = assessmentForm.metrics
      .filter((metric) => metric.label.trim() && metric.unit.trim() && metric.value !== "")
      .map((metric) => ({
        label: metric.label.trim(),
        unit: metric.unit.trim(),
        value: Number(metric.value),
      }));

    if (metrics.length === 0) {
      setAssessmentError(t("forms.requiredError"));
      return;
    }

    const input: CreateBodyAssessmentInput = {
      clientId,
      recordedAt: isoFromDate(assessmentForm.recordedDate, 8),
      notes: assessmentForm.notes.trim(),
      metrics,
    };

    addBodyAssessment(input);
    setAssessmentForm({
      recordedDate: dateInputValue(),
      notes: "",
      metrics: [
        { label: "", value: "", unit: "" },
        { label: "", value: "", unit: "" },
        { label: "", value: "", unit: "" },
      ],
    });
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={client.fullName} subtitle={client.notes} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("clients.packageLabel")}
          value={String(purchases[0] ? getRemainingUnits(purchases[0]) : 0)}
          detail={
            purchases[0]
              ? `${getPackageTemplate(state, purchases[0].templateId)?.name} / ${t("clientProfile.activePackageDetail")}`
              : t("clientProfile.noActivePackage")
          }
        />
        <StatCard
          label={t("clients.nextSession")}
          value={nextSession ? formatDate(nextSession.startAt, { day: "2-digit", month: "short" }) : "—"}
          detail={nextSession ? nextSession.title : t("clientProfile.noSession")}
        />
        <StatCard
          label={t("clients.activePlan")}
          value={activePlan ? "1" : "0"}
          detail={activePlan?.title ?? t("clientProfile.coachConfirmBlock")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title={t("clientProfile.overview")}
          subtitle={`${client.email} / ${client.phone}`}
          help={t("help.bodyAssessment")}
          aside={
            <div className="flex flex-wrap gap-3">
              {nextSession ? (
                <Link
                  href={`/clients/${client.id}/sessions/${nextSession.id}`}
                  className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white"
                >
                  {t("clientProfile.openActiveSession")}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (editingProfile) {
                    setProfileForm(buildClientProfileForm(client));
                    setProfileError(null);
                    setEditingProfile(false);
                    return;
                  }
                  setProfileForm(buildClientProfileForm(client));
                  setProfileError(null);
                  setEditingProfile(true);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  editingProfile
                    ? "border border-[color:var(--line-soft)] bg-white text-[color:var(--ink)]"
                    : "bg-[color:var(--clay)] text-white shadow-[0_12px_28px_rgba(196,93,66,0.22)]"
                }`}
              >
                {editingProfile ? t("common.cancel") : t("clientProfile.editProfile")}
              </button>
            </div>
          }
        >
          <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.profileDetails")}</p>
                <p className="mt-1 text-sm leading-6 text-[color:var(--muted-ink)]">
                  {client.email} / {client.phone}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={client.consentStatus} />
                <span className="rounded-full bg-[color:var(--sand-2)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]">
                  {client.preferredLanguage.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-3 text-sm leading-6 text-[color:var(--muted-ink)]">
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("fields.gender")}:</span>{" "}
                  {client.gender}
                </p>
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("fields.goals")}:</span>{" "}
                  {client.goals.join(", ") || t("common.none")}
                </p>
                <p>
                  <span className="font-semibold text-[color:var(--ink)]">{t("fields.tags")}:</span>{" "}
                  {client.tags.join(", ") || t("common.none")}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{t("fields.notes")}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                  {client.notes || t("common.none")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.healthFlags")}</p>
              <div className="mt-3 space-y-3">
                {client.healthFlags.length === 0 ? (
                  <EmptyState title={t("common.none")} body={t("forms.healthFlagsHint")} />
                ) : (
                  client.healthFlags.map((flag) => (
                    <div key={flag.title} className="rounded-2xl bg-[color:var(--sand-2)] p-3">
                      <p className="font-medium text-[color:var(--ink)]">{flag.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[color:var(--muted-ink)]">{flag.detail}</p>
                    </div>
                  ))
                )}
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
                <EmptyState title={t("common.none")} body={t("clientProfile.noAssessment")} />
              )}
            </div>
          </div>

          {editingProfile ? (
            <form
              className="mt-4 rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
              onSubmit={submitProfile}
            >
              <div className="mb-4 space-y-1">
                <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.editProfile")}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                  {t("clientProfile.editProfileSubtitle")}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.fullName")}>
                  <input
                    value={profileForm.fullName}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, fullName: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("auth.email")}>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.phone")}>
                  <input
                    value={profileForm.phone}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.gender")}>
                  <input
                    value={profileForm.gender}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, gender: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.preferredLanguage")}>
                  <select
                    value={profileForm.preferredLanguage}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        preferredLanguage: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="en">EN</option>
                    <option value="et">ET</option>
                  </select>
                </DataLabel>
                <DataLabel label={t("fields.consentStatus")}>
                  <select
                    value={profileForm.consentStatus}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        consentStatus: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    {(["pending", "signed", "declined"] as const).map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </DataLabel>
              </div>

              <DataLabel label={t("fields.goals")}>
                <textarea
                  value={profileForm.goalsText}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, goalsText: event.target.value }))
                  }
                  rows={3}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
                <p className="text-xs text-[color:var(--muted-ink)]">{t("forms.commaHint")}</p>
              </DataLabel>

              <DataLabel label={t("fields.tags")}>
                <textarea
                  value={profileForm.tagsText}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, tagsText: event.target.value }))
                  }
                  rows={2}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
                <p className="text-xs text-[color:var(--muted-ink)]">{t("forms.commaHint")}</p>
              </DataLabel>

              <DataLabel label={t("fields.healthFlags")}>
                <textarea
                  value={profileForm.healthFlagsText}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      healthFlagsText: event.target.value,
                    }))
                  }
                  rows={3}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
                <p className="text-xs text-[color:var(--muted-ink)]">{t("forms.healthFlagsHint")}</p>
              </DataLabel>

              <DataLabel label={t("fields.notes")}>
                <textarea
                  value={profileForm.notes}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, notes: event.target.value }))
                  }
                  rows={4}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>

              {profileError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {profileError}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
                >
                  {t("common.save")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileForm(buildClientProfileForm(client));
                    setProfileError(null);
                    setEditingProfile(false);
                  }}
                  className="rounded-full border border-[color:var(--line-soft)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--ink)]"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          ) : null}
        </SectionCard>

        <SectionCard title={t("clientProfile.packages")} help={t("help.packageBalance")}>
          <div className="space-y-4">
            {purchases.length === 0 ? (
              <EmptyState title={t("common.none")} body={t("clientProfile.noPurchaseHistory")} />
            ) : (
              purchases.map((purchase) => {
                const template = getPackageTemplate(state, purchase.templateId);
                const remainingUnits = getRemainingUnits(purchase);
                return (
                  <div key={purchase.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--ink)]">{template?.name}</p>
                        <p className="text-sm text-[color:var(--muted-ink)]">
                          {formatDate(purchase.purchasedAt)} / {formatCurrency(purchase.price)}
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
              })
            )}

            <form
              className="rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
              onSubmit={submitPackage}
            >
              <div className="mb-4 space-y-1">
                <p className="font-semibold text-[color:var(--ink)]">{t("forms.purchaseTitle")}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-ink)]">{t("forms.purchaseSubtitle")}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.packageTemplate")}>
                  <select
                    value={packageForm.templateId}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, templateId: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    {state.packageTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </DataLabel>
                <DataLabel label={t("fields.paymentStatus")}>
                  <select
                    value={packageForm.paymentStatus}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, paymentStatus: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    {(["pending", "partial", "paid", "overdue"] as const).map((status) => (
                      <option key={status} value={status}>
                        {t(`status.${status}`)}
                      </option>
                    ))}
                  </select>
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <DataLabel label={t("fields.purchasedAt")}>
                  <input
                    type="date"
                    value={packageForm.purchasedDate}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, purchasedDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.startsAt")}>
                  <input
                    type="date"
                    value={packageForm.startsDate}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, startsDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.expiresAt")}>
                  <input
                    type="date"
                    value={packageForm.expiresDate}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, expiresDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[0.4fr_0.6fr]">
                <DataLabel label={t("fields.amountPaid")}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packageForm.amountPaid}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, amountPaid: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("forms.packageNotes")}>
                  <input
                    value={packageForm.notes}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              {packageError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {packageError}
                </div>
              ) : null}

              <button
                type="submit"
                className="mt-4 rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
              >
                {t("forms.purchaseSubmit")}
              </button>
            </form>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t("clientProfile.assessments")} help={t("help.bodyAssessment")}>
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            {assessments.length === 0 ? (
              <EmptyState title={t("common.none")} body={t("clientProfile.noAssessment")} />
            ) : (
              assessments.slice(0, 4).map((assessment) => (
                <div key={assessment.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[color:var(--ink)]">{formatDate(assessment.recordedAt)}</p>
                    <span className="text-sm text-[color:var(--muted-ink)]">{assessment.metrics.length}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {assessment.metrics.map((metric) => (
                      <div key={metric.id} className="rounded-2xl bg-[color:var(--sand-2)] p-3 text-center">
                        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted-ink)]">{metric.label}</p>
                        <p className="mt-2 text-lg font-semibold text-[color:var(--ink)]">
                          {metric.value}
                          {metric.unit}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--muted-ink)]">{assessment.notes}</p>
                </div>
              ))
            )}
          </div>

          <form
            className="rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
            onSubmit={submitAssessment}
          >
            <div className="mb-4 space-y-1">
              <p className="font-semibold text-[color:var(--ink)]">{t("forms.assessmentTitle")}</p>
              <p className="text-sm leading-6 text-[color:var(--muted-ink)]">{t("forms.assessmentSubtitle")}</p>
            </div>

            <DataLabel label={t("fields.assessmentDate")}>
              <input
                type="date"
                value={assessmentForm.recordedDate}
                onChange={(event) =>
                  setAssessmentForm((current) => ({ ...current, recordedDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
              />
            </DataLabel>

            <div className="mt-4 space-y-3">
              {assessmentForm.metrics.map((metric, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-[1.1fr_0.8fr_0.6fr]">
                  <DataLabel label={t("fields.metricLabel")}>
                    <input
                      value={metric.label}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          metrics: current.metrics.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </DataLabel>
                  <DataLabel label={t("fields.metricValue")}>
                    <input
                      type="number"
                      step="0.1"
                      value={metric.value}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          metrics: current.metrics.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, value: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </DataLabel>
                  <DataLabel label={t("fields.metricUnit")}>
                    <input
                      value={metric.unit}
                      onChange={(event) =>
                        setAssessmentForm((current) => ({
                          ...current,
                          metrics: current.metrics.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, unit: event.target.value } : item,
                          ),
                        }))
                      }
                      className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                    />
                  </DataLabel>
                </div>
              ))}
            </div>

            <DataLabel label={t("fields.notes")}>
              <textarea
                value={assessmentForm.notes}
                onChange={(event) =>
                  setAssessmentForm((current) => ({ ...current, notes: event.target.value }))
                }
                rows={4}
                className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
              />
            </DataLabel>

            {assessmentError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {assessmentError}
              </div>
            ) : null}

            <button
              type="submit"
              className="mt-4 rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
            >
              {t("forms.assessmentSubmit")}
            </button>
          </form>
        </div>
      </SectionCard>

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
            <StatCard
              label={t("clientProfile.nutritionCalories")}
              value={String(nutritionPlan.calories)}
              detail={t("clientProfile.nutritionPerDay")}
            />
            <StatCard
              label={t("clientProfile.nutritionProtein")}
              value={String(nutritionPlan.proteinGrams)}
              detail={t("clientProfile.nutritionGrams")}
            />
            <StatCard
              label={t("clientProfile.nutritionCarbs")}
              value={String(nutritionPlan.carbsGrams)}
              detail={t("clientProfile.nutritionGrams")}
            />
            <StatCard
              label={t("clientProfile.nutritionFats")}
              value={String(nutritionPlan.fatsGrams)}
              detail={t("clientProfile.nutritionGrams")}
            />
            <StatCard
              label={t("clientProfile.nutritionHydration")}
              value={String(nutritionPlan.hydrationLiters)}
              detail={t("clientProfile.nutritionLiters")}
            />
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
