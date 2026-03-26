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
  CreateWorkoutPlanInput,
  CreateWorkoutSessionInput,
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

type WorkoutSetForm = {
  id: string;
  label: string;
  reps: string;
  weightKg: string;
  tempo: string;
  rpe: string;
  note: string;
};

type WorkoutExerciseForm = {
  id: string;
  name: string;
  focus: string;
  note: string;
  sets: WorkoutSetForm[];
};

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value: string) {
  return value
    .split("\n")
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

function createWorkoutSetForm(label: string): WorkoutSetForm {
  return {
    id: `set-form-${crypto.randomUUID()}`,
    label,
    reps: "",
    weightKg: "",
    tempo: "",
    rpe: "",
    note: "",
  };
}

function createWorkoutExerciseForm(): WorkoutExerciseForm {
  return {
    id: `exercise-form-${crypto.randomUUID()}`,
    name: "",
    focus: "",
    note: "",
    sets: [createWorkoutSetForm("1"), createWorkoutSetForm("2"), createWorkoutSetForm("3")],
  };
}

function renumberSetForms(sets: WorkoutSetForm[]) {
  return sets.map((set, index) => ({
    ...set,
    label: String(index + 1),
  }));
}

function createWorkoutEntryForm() {
  return {
    status: "planned",
    title: "",
    objective: "",
    sessionDate: dateInputValue(),
    startTime: "08:00",
    durationMinutes: "60",
    kind: "solo",
    location: "Atlas Studio A",
    packagePurchaseId: "",
    coachNote: "",
    sessionNote: "",
    exercises: [createWorkoutExerciseForm()],
  };
}

function combineDateTime(date: string, time: string) {
  return `${date}T${time}:00.000Z`;
}

function addMinutesToIso(value: string, minutes: number) {
  const date = new Date(value);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const {
    state,
    addPackagePurchase,
    addBodyAssessment,
    addWorkoutPlan,
    addWorkoutSession,
    updateClient,
    refreshNutritionPlan,
  } = useCRM();
  const { t, formatDate, formatCurrency } = useLocaleContext();
  const client = getClient(state, clientId);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(() => buildClientProfileForm(client));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [isNutritionRefreshing, setIsNutritionRefreshing] = useState(false);
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
  const [workoutPlanForm, setWorkoutPlanForm] = useState({
    title: "",
    goal: "",
    focusAreasText: "",
    sessionPatternText: "",
    activeFrom: dateInputValue(),
  });
  const [workoutEntryForm, setWorkoutEntryForm] = useState(() => createWorkoutEntryForm());
  const [workoutPlanError, setWorkoutPlanError] = useState<string | null>(null);
  const [workoutEntryError, setWorkoutEntryError] = useState<string | null>(null);

  if (!client) {
    return <EmptyState title={t("clientProfile.missingTitle")} body={t("clientProfile.missingBody")} />;
  }

  const purchases = getClientPurchases(state, clientId);
  const assessments = getClientAssessments(state, clientId);
  const sessions = getClientSessions(state, clientId);
  const workoutPlans = getClientWorkoutPlans(state, clientId);
  const activePlan = workoutPlans.find((plan) => plan.status === "active");
  const nutritionPlan = getClientNutritionPlans(state, clientId).find(
    (plan) => plan.status === "active",
  );
  const nextSession = getClientUpcomingSession(state, clientId);
  const drafts = getClientDrafts(state, clientId).slice(0, 3);
  const messages = getClientMessages(state, clientId).slice(0, 4);
  const mealDistribution = nutritionPlan
    ? [
        {
          key: "breakfast",
          label: t("clientProfile.breakfast"),
          share: nutritionPlan.breakfastSharePercent,
        },
        {
          key: "lunch",
          label: t("clientProfile.lunch"),
          share: nutritionPlan.lunchSharePercent,
        },
        {
          key: "dinner",
          label: t("clientProfile.dinner"),
          share: nutritionPlan.dinnerSharePercent,
        },
      ]
    : [];

  async function handleManualNutritionRefresh() {
    setNutritionError(null);
    setIsNutritionRefreshing(true);

    try {
      await refreshNutritionPlan({
        clientId,
        trigger: "manual",
      });
    } catch (error) {
      setNutritionError(
        error instanceof Error ? error.message : t("clientProfile.nutritionGenerationFailed"),
      );
    } finally {
      setIsNutritionRefreshing(false);
    }
  }

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

  function submitWorkoutPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkoutPlanError(null);

    if (!workoutPlanForm.title.trim() || !workoutPlanForm.goal.trim()) {
      setWorkoutPlanError(t("forms.requiredError"));
      return;
    }

    const input: CreateWorkoutPlanInput = {
      clientId,
      title: workoutPlanForm.title.trim(),
      goal: workoutPlanForm.goal.trim(),
      focusAreas: splitCsv(workoutPlanForm.focusAreasText),
      sessionPattern: splitLines(workoutPlanForm.sessionPatternText),
      activeFrom: isoFromDate(workoutPlanForm.activeFrom, 6),
    };

    addWorkoutPlan(input);
    setWorkoutPlanForm({
      title: "",
      goal: "",
      focusAreasText: "",
      sessionPatternText: "",
      activeFrom: dateInputValue(),
    });
  }

  function submitWorkoutEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkoutEntryError(null);

    if (
      !workoutEntryForm.title.trim() ||
      !workoutEntryForm.sessionDate ||
      !workoutEntryForm.startTime
    ) {
      setWorkoutEntryError(t("forms.requiredError"));
      return;
    }

    const durationMinutes = Number(workoutEntryForm.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setWorkoutEntryError(t("forms.requiredError"));
      return;
    }

    const exercises = workoutEntryForm.exercises
      .map((exercise) => ({
        name: exercise.name.trim(),
        focus: exercise.focus.trim(),
        note: exercise.note.trim(),
        sets: exercise.sets
          .map((set) => ({
            label: set.label.trim() || "1",
            reps: set.reps.trim(),
            weightKg: set.weightKg === "" ? undefined : Number(set.weightKg),
            tempo: set.tempo.trim(),
            rpe: set.rpe === "" ? undefined : Number(set.rpe),
            note: set.note.trim(),
          }))
          .filter((set) => set.reps),
      }))
      .filter((exercise) => exercise.name && exercise.sets.length > 0);

    if (exercises.length === 0) {
      setWorkoutEntryError(t("forms.requiredError"));
      return;
    }

    const startAt = combineDateTime(workoutEntryForm.sessionDate, workoutEntryForm.startTime);
    const endAt = addMinutesToIso(startAt, durationMinutes);
    const input: CreateWorkoutSessionInput = {
      clientId,
      title: workoutEntryForm.title.trim(),
      objective: workoutEntryForm.objective.trim(),
      startAt,
      endAt,
      kind: workoutEntryForm.kind as CreateWorkoutSessionInput["kind"],
      status: workoutEntryForm.status as CreateWorkoutSessionInput["status"],
      location: workoutEntryForm.location.trim(),
      packagePurchaseId: workoutEntryForm.packagePurchaseId || undefined,
      coachNote: workoutEntryForm.coachNote.trim(),
      sessionNote: workoutEntryForm.sessionNote.trim(),
      exercises,
    };

    addWorkoutSession(input);
    setWorkoutEntryForm(createWorkoutEntryForm());
  }

  function updateWorkoutExercise(
    exerciseId: string,
    patch: Partial<Omit<WorkoutExerciseForm, "id" | "sets">>,
  ) {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...patch } : exercise,
      ),
    }));
  }

  function updateWorkoutSet(
    exerciseId: string,
    setId: string,
    patch: Partial<Omit<WorkoutSetForm, "id">>,
  ) {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
            }
          : exercise,
      ),
    }));
  }

  function addWorkoutExerciseField() {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises: [...current.exercises, createWorkoutExerciseForm()],
    }));
  }

  function removeWorkoutExerciseField(exerciseId: string) {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises:
        current.exercises.length === 1
          ? current.exercises
          : current.exercises.filter((exercise) => exercise.id !== exerciseId),
    }));
  }

  function addWorkoutSetField(exerciseId: string) {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                createWorkoutSetForm(String(exercise.sets.length + 1)),
              ],
            }
          : exercise,
      ),
    }));
  }

  function removeWorkoutSetField(exerciseId: string, setId: string) {
    setWorkoutEntryForm((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets:
                exercise.sets.length === 1
                  ? exercise.sets
                  : renumberSetForms(exercise.sets.filter((set) => set.id !== setId)),
            }
          : exercise,
      ),
    }));
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={client.fullName} />

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
          help={t("help.bodyAssessment")}
          aside={
            <div className="flex flex-wrap gap-3">
              {nextSession ? (
                <Link
                  href={`/clients/${client.id}/sessions/${nextSession.id}`}
                  className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--ink)] bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold leading-none text-white shadow-[0_14px_30px_rgba(27,39,33,0.22)]"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/12 text-base leading-none text-white"
                  >
                    &gt;
                  </span>
                  <span className="text-white">{t("clientProfile.openActiveSession")}</span>
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

          <div className="mt-6 grid gap-6 md:grid-cols-2">
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

      <SectionCard
        title={t("clientProfile.workouts")}
        subtitle={t("clientProfile.workoutSectionSubtitle")}
        help={t("help.workoutPlan")}
      >
        <datalist id={`exercise-library-${clientId}`}>
          {state.exerciseLibrary.map((exercise) => (
            <option key={exercise.id} value={exercise.name} />
          ))}
        </datalist>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.workoutBlocks")}</p>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--muted-ink)]">
                    {activePlan ? activePlan.goal : t("clientProfile.coachConfirmBlock")}
                  </p>
                </div>
                {activePlan ? <StatusBadge status={activePlan.status} /> : null}
              </div>

              {activePlan ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-[color:var(--sand-2)] p-4">
                    <p className="font-semibold text-[color:var(--ink)]">{activePlan.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                      {activePlan.goal}
                    </p>
                    {activePlan.focusAreas.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {activePlan.focusAreas.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-[color:var(--line-soft)] bg-white/75 px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    {workoutPlans.slice(0, 4).map((plan) => (
                      <div
                        key={plan.id}
                        className="rounded-2xl border border-[color:var(--line-soft)] bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[color:var(--ink)]">{plan.title}</p>
                            <p className="text-sm text-[color:var(--muted-ink)]">
                              {formatDate(plan.updatedAt)}
                            </p>
                          </div>
                          <StatusBadge status={plan.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState
                    title={t("common.none")}
                    body={t("clientProfile.noWorkoutBlocks")}
                  />
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.recentSessions")}</p>
                <span className="text-sm text-[color:var(--muted-ink)]">{sessions.length}</span>
              </div>

              <div className="mt-4 space-y-3">
                {sessions.length === 0 ? (
                  <EmptyState title={t("common.none")} body={t("clientProfile.noWorkoutHistory")} />
                ) : (
                  sessions
                    .slice()
                    .reverse()
                    .slice(0, 6)
                    .map((session) => (
                      <Link
                        key={session.id}
                        href={`/clients/${client.id}/sessions/${session.id}`}
                        className="block rounded-[24px] border border-[color:var(--line-soft)] bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[color:var(--ink)]">{session.title}</p>
                            <p className="text-sm text-[color:var(--muted-ink)]">
                              {formatDate(session.startAt)}
                            </p>
                          </div>
                          <StatusBadge status={session.status} />
                        </div>
                      </Link>
                    ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <form
              className="rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
              onSubmit={submitWorkoutPlan}
            >
              <div className="mb-4 space-y-1">
                <p className="font-semibold text-[color:var(--ink)]">{t("forms.workoutPlanTitle")}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                  {t("forms.workoutPlanSubtitle")}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.title")}>
                  <input
                    value={workoutPlanForm.title}
                    onChange={(event) =>
                      setWorkoutPlanForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.activeFrom")}>
                  <input
                    type="date"
                    value={workoutPlanForm.activeFrom}
                    onChange={(event) =>
                      setWorkoutPlanForm((current) => ({
                        ...current,
                        activeFrom: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <DataLabel label={t("fields.goal")}>
                <textarea
                  value={workoutPlanForm.goal}
                  onChange={(event) =>
                    setWorkoutPlanForm((current) => ({ ...current, goal: event.target.value }))
                  }
                  rows={3}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>

              <DataLabel label={t("fields.focusAreas")}>
                <textarea
                  value={workoutPlanForm.focusAreasText}
                  onChange={(event) =>
                    setWorkoutPlanForm((current) => ({
                      ...current,
                      focusAreasText: event.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
                <p className="text-xs text-[color:var(--muted-ink)]">{t("forms.commaHint")}</p>
              </DataLabel>

              <DataLabel label={t("fields.sessionPattern")}>
                <textarea
                  value={workoutPlanForm.sessionPatternText}
                  onChange={(event) =>
                    setWorkoutPlanForm((current) => ({
                      ...current,
                      sessionPatternText: event.target.value,
                    }))
                  }
                  rows={3}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>

              {workoutPlanError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {workoutPlanError}
                </div>
              ) : null}

              <button
                type="submit"
                className="mt-4 rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
              >
                {t("forms.workoutPlanSubmit")}
              </button>
            </form>

            <form
              className="rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
              onSubmit={submitWorkoutEntry}
            >
              <div className="mb-4 space-y-1">
                <p className="font-semibold text-[color:var(--ink)]">{t("forms.workoutSessionTitle")}</p>
                <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                  {t("forms.workoutSessionSubtitle")}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.status")}>
                  <select
                    value={workoutEntryForm.status}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="planned">{t("status.planned")}</option>
                    <option value="completed">{t("status.completed")}</option>
                  </select>
                </DataLabel>
                <DataLabel label={t("fields.sessionKind")}>
                  <select
                    value={workoutEntryForm.kind}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        kind: event.target.value,
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

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.title")}>
                  <input
                    value={workoutEntryForm.title}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({ ...current, title: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.location")}>
                  <input
                    value={workoutEntryForm.location}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <DataLabel label={t("fields.objective")}>
                <textarea
                  value={workoutEntryForm.objective}
                  onChange={(event) =>
                    setWorkoutEntryForm((current) => ({
                      ...current,
                      objective: event.target.value,
                    }))
                  }
                  rows={3}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_0.7fr_0.7fr]">
                <DataLabel label={t("fields.sessionDate")}>
                  <input
                    type="date"
                    value={workoutEntryForm.sessionDate}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        sessionDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
                <DataLabel label={t("fields.startTime")}>
                  <input
                    type="time"
                    value={workoutEntryForm.startTime}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        startTime: event.target.value,
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
                    value={workoutEntryForm.durationMinutes}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        durationMinutes: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
                <DataLabel label={t("fields.packagePurchase")}>
                  <select
                    value={workoutEntryForm.packagePurchaseId}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        packagePurchaseId: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    <option value="">{t("common.none")}</option>
                    {purchases.map((purchase) => {
                      const template = getPackageTemplate(state, purchase.templateId);
                      return (
                        <option key={purchase.id} value={purchase.id}>
                          {template?.name} ({getRemainingUnits(purchase)})
                        </option>
                      );
                    })}
                  </select>
                </DataLabel>
                <DataLabel label={t("workout.coachNotes")}>
                  <input
                    value={workoutEntryForm.coachNote}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        coachNote: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <DataLabel label={t("fields.notes")}>
                <textarea
                  value={workoutEntryForm.sessionNote}
                  onChange={(event) =>
                    setWorkoutEntryForm((current) => ({
                      ...current,
                      sessionNote: event.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>

              <div className="mt-5 space-y-4">
                {workoutEntryForm.exercises.map((exercise, exerciseIndex) => (
                  <div
                    key={exercise.id}
                    className="rounded-[22px] border border-[color:var(--line-soft)] bg-white/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-[color:var(--ink)]">
                        {t("fields.exerciseName")} {exerciseIndex + 1}
                      </p>
                      {workoutEntryForm.exercises.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeWorkoutExerciseField(exercise.id)}
                          className="rounded-full border border-[color:var(--line-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                        >
                          {t("workout.removeExercise")}
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <DataLabel label={t("fields.exerciseName")}>
                        <input
                          list={`exercise-library-${clientId}`}
                          value={exercise.name}
                          onChange={(event) =>
                            updateWorkoutExercise(exercise.id, { name: event.target.value })
                          }
                          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                        />
                      </DataLabel>
                      <DataLabel label={t("fields.exerciseFocus")}>
                        <input
                          value={exercise.focus}
                          onChange={(event) =>
                            updateWorkoutExercise(exercise.id, { focus: event.target.value })
                          }
                          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                        />
                      </DataLabel>
                    </div>

                    <DataLabel label={t("workout.exerciseNote")}>
                      <input
                        value={exercise.note}
                        onChange={(event) =>
                          updateWorkoutExercise(exercise.id, { note: event.target.value })
                        }
                        className="mt-4 w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                      />
                    </DataLabel>

                    <div className="mt-4 space-y-3">
                      {exercise.sets.map((set) => (
                        <div key={set.id} className="rounded-2xl bg-[color:var(--sand-2)]/75 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[color:var(--ink)]">
                              {t("workout.setColumn")} {set.label}
                            </p>
                            {exercise.sets.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeWorkoutSetField(exercise.id, set.id)}
                                className="rounded-full border border-[color:var(--line-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                              >
                                {t("workout.removeSet")}
                              </button>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-[0.95fr_0.75fr_0.75fr_0.75fr]">
                            <DataLabel label={t("fields.setReps")}>
                              <input
                                value={set.reps}
                                onChange={(event) =>
                                  updateWorkoutSet(exercise.id, set.id, {
                                    reps: event.target.value,
                                  })
                                }
                                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                              />
                            </DataLabel>
                            <DataLabel label={t("fields.setWeight")}>
                              <input
                                type="number"
                                step="0.5"
                                value={set.weightKg}
                                onChange={(event) =>
                                  updateWorkoutSet(exercise.id, set.id, {
                                    weightKg: event.target.value,
                                  })
                                }
                                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                              />
                            </DataLabel>
                            <DataLabel label={t("fields.setTempo")}>
                              <input
                                value={set.tempo}
                                onChange={(event) =>
                                  updateWorkoutSet(exercise.id, set.id, {
                                    tempo: event.target.value,
                                  })
                                }
                                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                              />
                            </DataLabel>
                            <DataLabel label={t("workout.rpe")}>
                              <input
                                type="number"
                                step="0.5"
                                min="1"
                                max="10"
                                value={set.rpe}
                                onChange={(event) =>
                                  updateWorkoutSet(exercise.id, set.id, {
                                    rpe: event.target.value,
                                  })
                                }
                                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                              />
                            </DataLabel>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => addWorkoutSetField(exercise.id)}
                        className="rounded-full border border-[color:var(--line-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                      >
                        {t("workout.addSet")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={addWorkoutExerciseField}
                  className="rounded-full border border-[color:var(--line-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                >
                  {t("workout.addExercise")}
                </button>
              </div>

              {workoutEntryError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {workoutEntryError}
                </div>
              ) : null}

              <button
                type="submit"
                className="mt-4 rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
              >
                {t("forms.workoutSessionSubmit")}
              </button>
            </form>
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

      <SectionCard
        title={t("plans.nutritionPlan")}
        subtitle={t("clientProfile.nutritionAutoSubtitle")}
        aside={
          <button
            type="button"
            onClick={() => void handleManualNutritionRefresh()}
            disabled={isNutritionRefreshing}
            className="rounded-full bg-[color:var(--clay)] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(196,93,66,0.22)] transition disabled:cursor-wait disabled:opacity-70"
          >
            {isNutritionRefreshing
              ? t("clientProfile.generatingNutrition")
              : t("clientProfile.generateNutritionPlan")}
          </button>
        }
      >
        {nutritionError ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {nutritionError}
          </div>
        ) : null}

        {nutritionPlan ? (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-5">
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

            <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-ink)]">
                      {t("clientProfile.nutritionRecommendation")}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--ink)]">
                      {nutritionPlan.title}
                    </h3>
                  </div>
                  <span className="rounded-full bg-[color:var(--sand-2)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ink)]">
                    AI
                  </span>
                </div>

                <p className="mt-4 text-sm leading-7 text-[color:var(--ink)]">
                  {nutritionPlan.coachRecommendation}
                </p>

                <div className="mt-5">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {t("clientProfile.nutritionPrinciples")}
                  </p>
                  <div className="mt-3 grid gap-3">
                    {nutritionPlan.principles.map((principle) => (
                      <div
                        key={principle}
                        className="rounded-2xl bg-[color:var(--sand-2)] px-4 py-3 text-sm leading-6 text-[color:var(--ink)]"
                      >
                        {principle}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {t("clientProfile.mealDistribution")}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-ink)]">
                    {formatDate(nutritionPlan.updatedAt, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {mealDistribution.map((meal) => (
                    <div
                      key={meal.key}
                      className="rounded-[22px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/70 p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-ink)]">
                        {meal.label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-[color:var(--ink)]">
                        {meal.share}%
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">
                        ~{Math.round((nutritionPlan.calories * meal.share) / 100)} kcal
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title={t("plans.nutritionPlan")}
            body={t("clientProfile.noNutritionPlan")}
          />
        )}
      </SectionCard>
    </div>
  );
}
