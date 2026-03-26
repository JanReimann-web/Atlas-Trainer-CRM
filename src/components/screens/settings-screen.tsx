"use client";

import { FormEvent, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { DataLabel, EmptyState, SectionCard, StatusBadge } from "@/components/crm-ui";
import { PageLead } from "@/components/screens/shared";
import { IntegrationHealth, PackageTemplate, TrainingLocation } from "@/lib/types";

const integrationDetailKey: Record<string, string> = {
  Firebase: "settings.integrationFirebaseDetail",
  OpenAI: "settings.integrationOpenAIDetail",
  "Microsoft Graph": "settings.integrationMicrosoftDetail",
};

function buildPackageForm(template?: PackageTemplate | null) {
  return {
    name: template?.name ?? "",
    sessionCount: String(template?.sessionCount ?? 1),
    tier: template?.tier ?? "solo",
    maxParticipants: String(template?.maxParticipants ?? 1),
    durationMinutes: String(template?.durationMinutes ?? 60),
    price: template ? String(template.price) : "",
  };
}

function buildLocationForm(location?: TrainingLocation | null) {
  return {
    name: location?.name ?? "",
  };
}

export function SettingsScreen({
  integrationHealth,
}: {
  integrationHealth: IntegrationHealth[];
}) {
  const {
    state,
    createPackageTemplate,
    updatePackageTemplate,
    deletePackageTemplate,
    createTrainingLocation,
    updateTrainingLocation,
    deleteTrainingLocation,
    deleteClient,
  } = useCRM();
  const { t, locale, formatCurrency } = useLocaleContext();
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [packageForm, setPackageForm] = useState(() => buildPackageForm());
  const [locationForm, setLocationForm] = useState(() => buildLocationForm());
  const [packageError, setPackageError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [clientDeleteQuery, setClientDeleteQuery] = useState("");
  const [clientDeleteError, setClientDeleteError] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const normalizedClientDeleteQuery = clientDeleteQuery.trim().toLowerCase();
  const clientDeleteMatches = state.clients.filter((client) => {
    if (!normalizedClientDeleteQuery) {
      return true;
    }

    return [
      client.fullName,
      client.email,
      client.phone,
      client.tags.join(" "),
      client.goals.join(" "),
    ].some((value) => value.toLowerCase().includes(normalizedClientDeleteQuery));
  });

  function getCatalogError(reason: string | undefined, type: "package" | "location") {
    if (reason === "duplicate") {
      return t("settings.duplicateNameError");
    }

    if (reason === "in-use") {
      return t(
        type === "package"
          ? "settings.packageDeleteBlocked"
          : "settings.locationDeleteBlocked",
      );
    }

    return t("settings.invalidCatalogEntry");
  }

  function resetPackageForm() {
    setEditingPackageId(null);
    setPackageForm(buildPackageForm());
    setPackageError(null);
  }

  function resetLocationForm() {
    setEditingLocationId(null);
    setLocationForm(buildLocationForm());
    setLocationError(null);
  }

  function handlePackageSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPackageError(null);

    const payload = {
      name: packageForm.name,
      sessionCount: Number(packageForm.sessionCount),
      tier: packageForm.tier as PackageTemplate["tier"],
      maxParticipants: Number(packageForm.maxParticipants),
      durationMinutes: Number(packageForm.durationMinutes),
      price: Number(packageForm.price),
    };

    const result = editingPackageId
      ? updatePackageTemplate(editingPackageId, payload)
      : createPackageTemplate(payload);

    if (!result.ok) {
      setPackageError(getCatalogError(result.reason, "package"));
      return;
    }

    resetPackageForm();
  }

  function handleLocationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocationError(null);

    const payload = {
      name: locationForm.name,
    };

    const result = editingLocationId
      ? updateTrainingLocation(editingLocationId, payload)
      : createTrainingLocation(payload);

    if (!result.ok) {
      setLocationError(getCatalogError(result.reason, "location"));
      return;
    }

    resetLocationForm();
  }

  async function handleClientDelete(clientId: string) {
    const client = state.clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const confirmed = window.confirm(
      `${t("settings.clientDeleteConfirm")} ${client.fullName}?`,
    );
    if (!confirmed) {
      return;
    }

    setClientDeleteError(null);
    setDeletingClientId(clientId);

    try {
      await deleteClient(clientId);
    } catch (error) {
      setClientDeleteError(
        error instanceof Error ? error.message : t("settings.clientDeleteFailed"),
      );
    } finally {
      setDeletingClientId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.settings")} title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title={t("settings.integrations")} help={t("help.integrations")}>
          <div className="space-y-3">
            {integrationHealth.map((service) => (
              <div
                key={service.name}
                className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[color:var(--ink)]">{service.name}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                      {t(integrationDetailKey[service.name] ?? service.detail)}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[color:var(--muted-ink)]">
                      {service.envKeys.join(" / ")}
                    </p>
                  </div>
                  <StatusBadge status={service.state} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard
            title={t("settings.packageCatalog")}
            subtitle={t("settings.packageCatalogSubtitle")}
          >
            <form onSubmit={handlePackageSubmit} className="rounded-[24px] bg-[color:var(--sand-2)]/45 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.packageTemplate")}>
                  <input
                    value={packageForm.name}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.sessionKind")}>
                  <select
                    value={packageForm.tier}
                    onChange={(event) =>
                      setPackageForm((current) => ({
                        ...current,
                        tier: event.target.value as PackageTemplate["tier"],
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="solo">{t("sessionKind.solo")}</option>
                    <option value="duo">{t("sessionKind.duo")}</option>
                    <option value="group">{t("sessionKind.group")}</option>
                  </select>
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DataLabel label={t("settings.sessionCount")}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={packageForm.sessionCount}
                    onChange={(event) =>
                      setPackageForm((current) => ({
                        ...current,
                        sessionCount: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("settings.maxParticipants")}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={packageForm.maxParticipants}
                    onChange={(event) =>
                      setPackageForm((current) => ({
                        ...current,
                        maxParticipants: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.durationMinutes")}>
                  <input
                    type="number"
                    min="15"
                    step="5"
                    value={packageForm.durationMinutes}
                    onChange={(event) =>
                      setPackageForm((current) => ({
                        ...current,
                        durationMinutes: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.price")}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packageForm.price}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, price: event.target.value }))
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

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
                >
                  {editingPackageId ? t("settings.updatePackage") : t("settings.addPackage")}
                </button>
                {editingPackageId ? (
                  <button
                    type="button"
                    onClick={resetPackageForm}
                    className="rounded-full border border-[color:var(--line-soft)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--ink)]"
                  >
                    {t("common.cancel")}
                  </button>
                ) : null}
              </div>
            </form>

            <div className="mt-5 space-y-3">
              {state.packageTemplates.length === 0 ? (
                <EmptyState
                  title={t("settings.packageCatalog")}
                  body={t("settings.packageCatalogEmpty")}
                />
              ) : (
                state.packageTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-[22px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--ink)]">{template.name}</p>
                        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                          {t(`sessionKind.${template.tier}`)} / {template.sessionCount}{" "}
                          {t("settings.packageSession")} / {template.durationMinutes} min /{" "}
                          {t("settings.packageUpTo")} {template.maxParticipants}{" "}
                          {template.maxParticipants === 1
                            ? t("settings.packagePerson")
                            : t("settings.packagePeople")}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-2 text-sm font-semibold text-[color:var(--ink)]">
                          {formatCurrency(template.price)}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPackageId(template.id);
                            setPackageForm(buildPackageForm(template));
                            setPackageError(null);
                          }}
                          className="rounded-full border border-[color:var(--line-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)]"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const result = deletePackageTemplate(template.id);
                            if (!result.ok) {
                              setPackageError(getCatalogError(result.reason, "package"));
                              return;
                            }

                            if (editingPackageId === template.id) {
                              resetPackageForm();
                            }
                          }}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={t("settings.locationCatalog")}
            subtitle={t("settings.locationCatalogSubtitle")}
          >
            <form onSubmit={handleLocationSubmit} className="rounded-[24px] bg-[color:var(--sand-2)]/45 p-4">
              <DataLabel label={t("fields.location")}>
                <input
                  value={locationForm.name}
                  onChange={(event) =>
                    setLocationForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                />
              </DataLabel>

              {locationError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {locationError}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
                >
                  {editingLocationId ? t("settings.updateLocation") : t("settings.addLocation")}
                </button>
                {editingLocationId ? (
                  <button
                    type="button"
                    onClick={resetLocationForm}
                    className="rounded-full border border-[color:var(--line-soft)] bg-white px-5 py-3 text-sm font-semibold text-[color:var(--ink)]"
                  >
                    {t("common.cancel")}
                  </button>
                ) : null}
              </div>
            </form>

            <div className="mt-5 space-y-3">
              {state.trainingLocations.length === 0 ? (
                <EmptyState
                  title={t("settings.locationCatalog")}
                  body={t("settings.locationCatalogEmpty")}
                />
              ) : (
                state.trainingLocations.map((location) => {
                  const usageCount = state.sessions.filter(
                    (session) => session.location === location.name,
                  ).length;

                  return (
                    <div
                      key={location.id}
                      className="rounded-[22px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[color:var(--ink)]">{location.name}</p>
                          <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                            {usageCount === 0
                              ? t("settings.locationUnused")
                              : `${usageCount} ${t("settings.locationSessionCount")}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLocationId(location.id);
                              setLocationForm(buildLocationForm(location));
                              setLocationError(null);
                            }}
                            className="rounded-full border border-[color:var(--line-soft)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--ink)]"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const result = deleteTrainingLocation(location.id);
                              if (!result.ok) {
                                setLocationError(getCatalogError(result.reason, "location"));
                                return;
                              }

                              if (editingLocationId === location.id) {
                                resetLocationForm();
                              }
                            }}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionCard>

          <SectionCard title={t("settings.translation")}>
            <div className="rounded-[24px] bg-white/60 p-4 text-sm leading-6 text-[color:var(--muted-ink)]">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[color:var(--ink)]">{locale.toUpperCase()}</p>
                <StatusBadge status="ready" />
              </div>
              <p className="mt-2">{t("settings.translationNote")}</p>
            </div>
          </SectionCard>

          <SectionCard
            title={t("settings.clientDelete")}
            subtitle={t("settings.clientDeleteSubtitle")}
          >
            <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 p-4">
              <DataLabel label={t("common.search")}>
                <input
                  value={clientDeleteQuery}
                  onChange={(event) => setClientDeleteQuery(event.target.value)}
                  placeholder={t("settings.clientDeleteSearch")}
                  className="w-full rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm outline-none"
                />
              </DataLabel>
              <p className="mt-4 text-sm leading-6 text-rose-950/80">
                {t("settings.clientDeleteWarning")}
              </p>
            </div>

            {clientDeleteError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {clientDeleteError}
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              {state.clients.length === 0 ? (
                <EmptyState
                  title={t("settings.clientDelete")}
                  body={t("settings.clientDeleteEmpty")}
                />
              ) : clientDeleteMatches.length === 0 ? (
                <EmptyState
                  title={t("settings.clientDelete")}
                  body={t("forms.noSearchResults")}
                />
              ) : (
                clientDeleteMatches.map((client) => (
                  <div
                    key={client.id}
                    className="rounded-[22px] border border-rose-100 bg-white/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="font-semibold text-[color:var(--ink)]">
                          {client.fullName}
                        </p>
                        <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                          {client.email} / {client.phone}
                        </p>
                        <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                          {client.goals.join(", ") || "-"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleClientDelete(client.id)}
                        disabled={deletingClientId === client.id}
                        className="rounded-full border border-rose-200 bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingClientId === client.id
                          ? t("settings.clientDeleting")
                          : t("settings.clientDeleteAction")}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
