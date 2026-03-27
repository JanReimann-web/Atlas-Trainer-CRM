"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  DataLabel,
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/crm-ui";
import {
  getActivePackagePurchase,
  getClient,
  getClientAssessments,
  getClientDrafts,
  getClientNutritionPlans,
  getClientOutstandingInvoices,
  getClientOutstandingRevenue,
  getClientPurchases,
  getClientSessions,
  getClientUpcomingSession,
  getClientWorkoutPlans,
  getInvoiceOutstandingAmount,
  getPackageTemplate,
  getPurchaseLinkedClientIds,
  getRemainingUnits,
} from "@/lib/selectors";
import {
  ClientProfile,
  CreateBodyAssessmentInput,
  CreateClientInput,
  CreatePackagePurchaseInput,
  CreateWorkoutSessionInput,
  HealthFlag,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";
import {
  addMinutesToIso,
  buildIsoFromDate,
  buildIsoFromDateTime,
  getDateInputValue,
} from "@/lib/date";
import { PageLead } from "@/components/screens/shared";

const defaultClientProfileForm = {
  fullName: "",
  email: "",
  phone: "",
  gender: "unspecified",
  goalsText: "",
  tagsText: "",
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

type AssessmentMetricForm = {
  id: string;
  label: string;
  value: string;
  unit: string;
};

type PackageForm = {
  templateId: string;
  sharedClientId: string;
  purchasedDate: string;
  startsDate: string;
  expiresDate: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  notes: string;
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
    goalsText: client.goals.join(", "),
    tagsText: client.tags.join(", "),
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

function createWorkoutEntryForm(defaultLocation = "") {
  return {
    status: "planned",
    title: "",
    objective: "",
    sessionDate: getDateInputValue(),
    startTime: "08:00",
    durationMinutes: "60",
    kind: "solo",
    location: defaultLocation,
    sessionNote: "",
    exercises: [createWorkoutExerciseForm()],
  };
}

function createAssessmentMetricForm(): AssessmentMetricForm {
  return {
    id: `metric-form-${crypto.randomUUID()}`,
    label: "",
    value: "",
    unit: "",
  };
}

function getSuggestedPaidAmount(
  paymentStatus: PaymentStatus,
  templatePrice: number,
  currentAmount = "",
) {
  if (paymentStatus === "paid") {
    return String(templatePrice);
  }

  if (paymentStatus === "partial") {
    return currentAmount || String(templatePrice);
  }

  return "";
}

function createPackageForm(templateId = "", templatePrice = 0): PackageForm {
  return {
    templateId,
    sharedClientId: "",
    purchasedDate: getDateInputValue(),
    startsDate: getDateInputValue(),
    expiresDate: getDateInputValue(60),
    paymentStatus: "paid",
    paymentMethod: "card",
    amountPaid: templatePrice > 0 ? String(templatePrice) : "",
    notes: "",
  };
}

function NutritionMetricCard({
  label,
  value,
  detail,
  mealBreakdown,
}: {
  label: string;
  value: string;
  detail: string;
  mealBreakdown: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="panel-surface min-w-0 rounded-[24px] p-4 sm:rounded-[28px] sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted-ink)] sm:text-xs sm:tracking-[0.28em]">
        {label}
      </p>
      <p className="mt-3 break-words font-display text-[clamp(2.6rem,12vw,3.3rem)] text-[color:var(--ink)] sm:text-4xl">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{detail}</p>
      <div className="mt-3 space-y-1.5 text-xs leading-5 text-[color:var(--muted-ink)]">
        {mealBreakdown.map((meal) => (
          <div key={meal.label} className="flex items-center justify-between gap-3">
            <span>{meal.label}</span>
            <span className="font-semibold text-[color:var(--ink)]">{meal.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const {
    state,
    addPackagePurchase,
    addBodyAssessment,
    addWorkoutSession,
    updateClient,
    refreshNutritionPlan,
  } = useCRM();
  const { t, locale, formatDate, formatCurrency } = useLocaleContext();
  const refreshNutritionPlanRef = useRef(refreshNutritionPlan);
  const nutritionBootstrapAttemptRef = useRef<Set<string>>(new Set());
  const client = getClient(state, clientId);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(() => buildClientProfileForm(client));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [isNutritionRefreshing, setIsNutritionRefreshing] = useState(false);
  const [packageForm, setPackageForm] = useState<PackageForm>(() =>
    createPackageForm(
      state.packageTemplates[0]?.id ?? "",
      state.packageTemplates[0]?.price ?? 0,
    ),
  );
  const [assessmentForm, setAssessmentForm] = useState({
    recordedDate: getDateInputValue(),
    notes: "",
    metrics: [createAssessmentMetricForm()],
  });
  const [packageError, setPackageError] = useState<string | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [workoutEntryForm, setWorkoutEntryForm] = useState(() =>
    createWorkoutEntryForm(state.trainingLocations[0]?.name ?? ""),
  );
  const [workoutEntryError, setWorkoutEntryError] = useState<string | null>(null);
  const [isWorkoutExerciseEditorOpen, setIsWorkoutExerciseEditorOpen] = useState(false);
  const [openWorkoutRecapId, setOpenWorkoutRecapId] = useState<string | null>(null);

  useEffect(() => {
    refreshNutritionPlanRef.current = refreshNutritionPlan;
  }, [refreshNutritionPlan]);

  useEffect(() => {
    const fallbackTemplate = state.packageTemplates[0];
    setPackageForm((current) => {
      const template =
        state.packageTemplates.find((item) => item.id === current.templateId) ?? fallbackTemplate;
      if (!template) {
        return current;
      }

      const nextTemplateId = template.id;
      const nextAmount =
        current.templateId === nextTemplateId
          ? current.amountPaid
          : getSuggestedPaidAmount(current.paymentStatus, template.price, current.amountPaid);

      if (current.templateId === nextTemplateId && current.amountPaid === nextAmount) {
        return current;
      }

      return {
        ...current,
        templateId: nextTemplateId,
        amountPaid: nextAmount,
      };
    });
  }, [state.packageTemplates]);

  useEffect(() => {
    setPackageForm((current) => {
      const template = state.packageTemplates.find((item) => item.id === current.templateId);
      const sharedClientStillExists =
        !current.sharedClientId ||
        state.clients.some(
          (linkedClient) =>
            linkedClient.id === current.sharedClientId && linkedClient.id !== clientId,
        );

      if (
        current.sharedClientId === "" ||
        (template?.tier === "duo" && sharedClientStillExists)
      ) {
        return current;
      }

      return {
        ...current,
        sharedClientId: "",
      };
    });
  }, [clientId, state.clients, state.packageTemplates]);

  useEffect(() => {
    const defaultLocation = state.trainingLocations[0]?.name ?? "";
    setWorkoutEntryForm((current) =>
      current.location &&
      state.trainingLocations.some((location) => location.name === current.location)
        ? current
        : { ...current, location: defaultLocation },
    );
  }, [state.trainingLocations]);

  const purchases = getClientPurchases(state, clientId);
  const assessments = getClientAssessments(state, clientId);
  const sessions = getClientSessions(state, clientId);
  const workoutPlans = getClientWorkoutPlans(state, clientId);
  const activePlan = workoutPlans.find((plan) => plan.status === "active");
  const nutritionPlan = getClientNutritionPlans(state, clientId).find(
    (plan) => plan.status === "active",
  );
  const nextSession = getClientUpcomingSession(state, clientId);
  const recentSessions = [...sessions].sort((left, right) => {
    if (!left.startAt && !right.startAt) {
      return 0;
    }

    if (!left.startAt) {
      return -1;
    }

    if (!right.startAt) {
      return 1;
    }

    return right.startAt.localeCompare(left.startAt);
  });
  const workoutRecaps = getClientDrafts(state, clientId).filter(
    (draft) => draft.type === "workout-summary" && draft.status === "sent",
  );
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
  const localeTag = locale === "et" ? "et-EE" : "en-GB";
  const formatMealAmount = (value: number, unit: "kcal" | "g" | "l") => {
    const shouldUseFraction = unit === "l" && !Number.isInteger(value);
    const formatted = new Intl.NumberFormat(localeTag, {
      minimumFractionDigits: shouldUseFraction ? 1 : 0,
      maximumFractionDigits: shouldUseFraction ? 1 : 0,
    }).format(value);
    return `${formatted} ${unit}`;
  };
  const nutritionMetricCards = nutritionPlan
    ? [
        {
          key: "calories",
          label: t("clientProfile.nutritionCalories"),
          value: String(nutritionPlan.calories),
          detail: t("clientProfile.nutritionPerDay"),
          mealBreakdown: mealDistribution.map((meal) => ({
            label: meal.label,
            value: `~${formatMealAmount(Math.round((nutritionPlan.calories * meal.share) / 100), "kcal")}`,
          })),
        },
        {
          key: "protein",
          label: t("clientProfile.nutritionProtein"),
          value: String(nutritionPlan.proteinGrams),
          detail: t("clientProfile.nutritionGrams"),
          mealBreakdown: mealDistribution.map((meal) => ({
            label: meal.label,
            value: `~${formatMealAmount(Math.round((nutritionPlan.proteinGrams * meal.share) / 100), "g")}`,
          })),
        },
        {
          key: "carbs",
          label: t("clientProfile.nutritionCarbs"),
          value: String(nutritionPlan.carbsGrams),
          detail: t("clientProfile.nutritionGrams"),
          mealBreakdown: mealDistribution.map((meal) => ({
            label: meal.label,
            value: `~${formatMealAmount(Math.round((nutritionPlan.carbsGrams * meal.share) / 100), "g")}`,
          })),
        },
        {
          key: "fats",
          label: t("clientProfile.nutritionFats"),
          value: String(nutritionPlan.fatsGrams),
          detail: t("clientProfile.nutritionGrams"),
          mealBreakdown: mealDistribution.map((meal) => ({
            label: meal.label,
            value: `~${formatMealAmount(Math.round((nutritionPlan.fatsGrams * meal.share) / 100), "g")}`,
          })),
        },
        {
          key: "hydration",
          label: t("clientProfile.nutritionHydration"),
          value: String(nutritionPlan.hydrationLiters),
          detail: t("clientProfile.nutritionLiters"),
          mealBreakdown: mealDistribution.map((meal) => ({
            label: meal.label,
            value: `~${formatMealAmount(
              Math.round(((nutritionPlan.hydrationLiters * meal.share) / 100) * 10) / 10,
              "l",
            )}`,
          })),
        },
      ]
    : [];
  const selectedPackageTemplate =
    state.packageTemplates.find((template) => template.id === packageForm.templateId) ?? null;
  const availableSharedClients = state.clients
    .filter((item) => item.id !== clientId)
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const activePurchase = getActivePackagePurchase(state, clientId);
  const activePurchaseTemplate = activePurchase
    ? getPackageTemplate(state, activePurchase.templateId)
    : null;
  const activePurchaseOwner =
    activePurchase && activePurchase.clientId !== clientId
      ? getClient(state, activePurchase.clientId)
      : null;
  const activePurchaseSharedClients = activePurchase
    ? getPurchaseLinkedClientIds(activePurchase)
        .filter((linkedClientId) => linkedClientId !== activePurchase.clientId)
        .map((linkedClientId) => getClient(state, linkedClientId)?.fullName)
        .filter(Boolean)
    : [];
  const outstandingInvoices = getClientOutstandingInvoices(state, clientId);
  const clientOutstanding = getClientOutstandingRevenue(state, clientId);
  const uncoveredSessionInvoices = outstandingInvoices.filter(
    (invoice) => invoice.source === "session-debt",
  );
  const packageStatBaseDetail = activePurchase
    ? activePurchase.clientId !== clientId && activePurchaseOwner
      ? `${activePurchaseTemplate?.name} / ${t("clientProfile.sharedPurchasePaidBy")}: ${activePurchaseOwner.fullName}`
      : activePurchaseSharedClients.length > 0
        ? `${activePurchaseTemplate?.name} / ${t("clientProfile.sharedPurchaseWith")}: ${activePurchaseSharedClients.join(", ")}`
        : `${activePurchaseTemplate?.name} / ${t("clientProfile.activePackageDetail")}`
    : t("clientProfile.noActivePackage");
  const packageStatDetail =
    clientOutstanding > 0
      ? `${packageStatBaseDetail} / ${t("clientProfile.openBalance")}: ${formatCurrency(clientOutstanding)}`
      : packageStatBaseDetail;

  useEffect(() => {
    if (!client || nutritionPlan || assessments.length === 0) {
      return;
    }

    if (nutritionBootstrapAttemptRef.current.has(client.id)) {
      return;
    }

    nutritionBootstrapAttemptRef.current.add(client.id);
    setNutritionError(null);
    setIsNutritionRefreshing(true);

    void refreshNutritionPlanRef
      .current({
        clientId: client.id,
        assessmentsOverride: assessments,
        trigger: "assessment-backfill",
      })
      .catch((error) => {
        setNutritionError(
          error instanceof Error ? error.message : t("clientProfile.nutritionGenerationFailed"),
        );
      })
      .finally(() => {
        nutritionBootstrapAttemptRef.current.delete(client.id);
        setIsNutritionRefreshing(false);
      });
  }, [assessments, client, nutritionPlan, t]);

  if (!client) {
    return <EmptyState title={t("clientProfile.missingTitle")} body={t("clientProfile.missingBody")} />;
  }

  function setPackageTemplate(templateId: string) {
    const nextTemplate = state.packageTemplates.find((template) => template.id === templateId);
    const nextPrice = nextTemplate?.price ?? 0;

    setPackageForm((current) => ({
      ...current,
      templateId,
      sharedClientId: nextTemplate?.tier === "duo" ? current.sharedClientId : "",
      amountPaid: getSuggestedPaidAmount(current.paymentStatus, nextPrice, current.amountPaid),
    }));
  }

  function setPackagePaymentStatus(paymentStatus: PaymentStatus) {
    setPackageForm((current) => ({
      ...current,
      paymentStatus,
      amountPaid: getSuggestedPaidAmount(
        paymentStatus,
        selectedPackageTemplate?.price ?? 0,
        current.amountPaid,
      ),
    }));
  }

  function setPackagePaymentMethod(paymentMethod: PaymentMethod) {
    setPackageForm((current) => ({ ...current, paymentMethod }));
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
      preferredLanguage: client.preferredLanguage,
      goals: splitCsv(profileForm.goalsText),
      tags: splitCsv(profileForm.tagsText),
      consentStatus: client.consentStatus,
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
    if (!template) {
      setPackageError(t("forms.requiredError"));
      return;
    }

    const amountPaid =
      packageForm.paymentStatus === "paid"
        ? template.price
        : packageForm.paymentStatus === "partial"
          ? Number(packageForm.amountPaid || 0)
          : 0;

    if (packageForm.paymentStatus === "partial" && amountPaid <= 0) {
      setPackageError(t("forms.requiredError"));
      return;
    }

    if (template.tier === "duo" && !packageForm.sharedClientId) {
      setPackageError(t("forms.duoPartnerRequired"));
      return;
    }

    const input: CreatePackagePurchaseInput = {
      clientId,
      sharedClientIds:
        template.tier === "duo" && packageForm.sharedClientId
          ? [packageForm.sharedClientId]
          : [],
      templateId: packageForm.templateId,
      purchasedAt: buildIsoFromDate(packageForm.purchasedDate, 9),
      startsAt: buildIsoFromDate(packageForm.startsDate, 9),
      expiresAt: buildIsoFromDate(packageForm.expiresDate, 21),
      paymentStatus: packageForm.paymentStatus as CreatePackagePurchaseInput["paymentStatus"],
      amountPaid,
      paymentMethod: packageForm.paymentMethod,
      notes: packageForm.notes.trim(),
    };

    addPackagePurchase(input);
    setPackageForm(createPackageForm(state.packageTemplates[0]?.id ?? "", state.packageTemplates[0]?.price ?? 0));
  }

  async function submitAssessment(event: FormEvent<HTMLFormElement>) {
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
      recordedAt: buildIsoFromDate(assessmentForm.recordedDate, 8),
      notes: assessmentForm.notes.trim(),
      metrics,
    };

    const nextAssessment = addBodyAssessment(input);
    setAssessmentForm({
      recordedDate: getDateInputValue(),
      notes: "",
      metrics: [createAssessmentMetricForm()],
    });

    if (!nextAssessment) {
      return;
    }

    setNutritionError(null);
    setIsNutritionRefreshing(true);

    try {
      await refreshNutritionPlanRef.current({
        clientId,
        assessmentsOverride: [nextAssessment, ...assessments],
        trigger: "assessment-update",
      });
    } catch (error) {
      setNutritionError(
        error instanceof Error ? error.message : t("clientProfile.nutritionGenerationFailed"),
      );
    } finally {
      setIsNutritionRefreshing(false);
    }
  }

  function submitWorkoutEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkoutEntryError(null);

    if (
      !workoutEntryForm.title.trim() ||
      !workoutEntryForm.sessionDate ||
      !workoutEntryForm.startTime ||
      !workoutEntryForm.location.trim()
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

    const startAt = buildIsoFromDateTime(
      workoutEntryForm.sessionDate,
      workoutEntryForm.startTime,
    );
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
      sessionNote: workoutEntryForm.sessionNote.trim(),
      exercises,
    };

    addWorkoutSession(input);
    setWorkoutEntryForm(createWorkoutEntryForm(state.trainingLocations[0]?.name ?? ""));
    setIsWorkoutExerciseEditorOpen(false);
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
    if (!isWorkoutExerciseEditorOpen) {
      setIsWorkoutExerciseEditorOpen(true);
      return;
    }

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

  function updateAssessmentMetric(
    metricId: string,
    patch: Partial<Omit<AssessmentMetricForm, "id">>,
  ) {
    setAssessmentForm((current) => ({
      ...current,
      metrics: current.metrics.map((metric) =>
        metric.id === metricId ? { ...metric, ...patch } : metric,
      ),
    }));
  }

  function addAssessmentMetricField() {
    setAssessmentForm((current) => ({
      ...current,
      metrics: [...current.metrics, createAssessmentMetricForm()],
    }));
  }

  function removeAssessmentMetricField(metricId: string) {
    setAssessmentForm((current) => {
      if (current.metrics.length === 1) {
        return {
          ...current,
          metrics: [createAssessmentMetricForm()],
        };
      }

      return {
        ...current,
        metrics: current.metrics.filter((metric) => metric.id !== metricId),
      };
    });
  }

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.clients")} title={client.fullName} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("clients.packageLabel")}
          value={String(activePurchase ? getRemainingUnits(activePurchase) : 0)}
          detail={packageStatDetail}
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
            {clientOutstanding > 0 ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-rose-900">
                      {t("clientProfile.openBalance")}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-rose-900/85">
                      {uncoveredSessionInvoices.length > 0
                        ? `${uncoveredSessionInvoices.length} ${t("clientProfile.uncoveredSessionCount")}`
                        : t("clientProfile.openBalancePackageOnly")}
                    </p>
                  </div>
                  <p className="font-semibold text-rose-900">
                    {formatCurrency(clientOutstanding)}
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {outstandingInvoices.map((invoice) => {
                    const purchase = invoice.packagePurchaseId
                      ? state.packagePurchases.find((item) => item.id === invoice.packagePurchaseId)
                      : null;
                    const template = purchase
                      ? getPackageTemplate(state, purchase.templateId)
                      : null;
                    const linkedSession = invoice.sessionId
                      ? sessions.find((session) => session.id === invoice.sessionId)
                      : null;

                    return (
                      <div
                        key={invoice.id}
                        className="rounded-[20px] border border-rose-200 bg-white/80 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-[color:var(--ink)]">
                              {invoice.source === "session-debt"
                                ? `${t("clientProfile.sessionDebtLabel")}: ${linkedSession?.title ?? invoice.description ?? invoice.id}`
                                : `${t("clientProfile.packageInvoiceLabel")}: ${template?.name ?? invoice.id}`}
                            </p>
                            <p className="mt-1 text-sm text-[color:var(--muted-ink)]">
                              {invoice.source === "session-debt"
                                ? formatDate(
                                    linkedSession?.endAt || linkedSession?.startAt || invoice.issuedAt,
                                  )
                                : `${formatDate(invoice.issuedAt)} / ${formatDate(invoice.dueAt)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge status={invoice.paymentStatus} />
                            <span className="text-sm font-semibold text-rose-900">
                              {formatCurrency(getInvoiceOutstandingAmount(state, invoice))}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {purchases.length === 0 ? (
              <EmptyState title={t("common.none")} body={t("clientProfile.noPurchaseHistory")} />
            ) : (
              purchases.map((purchase) => {
                const template = getPackageTemplate(state, purchase.templateId);
                const remainingUnits = getRemainingUnits(purchase);
                const purchaseOwner =
                  purchase.clientId !== clientId ? getClient(state, purchase.clientId) : null;
                const sharedClientNames = getPurchaseLinkedClientIds(purchase)
                  .filter((linkedClientId) => linkedClientId !== purchase.clientId)
                  .map((linkedClientId) => getClient(state, linkedClientId)?.fullName)
                  .filter((name): name is string => Boolean(name));
                return (
                  <div key={purchase.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[color:var(--ink)]">{template?.name}</p>
                        <p className="text-sm text-[color:var(--muted-ink)]">
                          {formatDate(purchase.purchasedAt)} / {formatCurrency(purchase.price)}
                        </p>
                        {purchaseOwner ? (
                          <p className="text-sm text-[color:var(--muted-ink)]">
                            {t("clientProfile.sharedPurchasePaidBy")}: {purchaseOwner.fullName}
                          </p>
                        ) : sharedClientNames.length > 0 ? (
                          <p className="text-sm text-[color:var(--muted-ink)]">
                            {t("clientProfile.sharedPurchaseWith")}: {sharedClientNames.join(", ")}
                          </p>
                        ) : null}
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
              <div className="mb-4">
                <p className="font-semibold text-[color:var(--ink)]">{t("forms.purchaseTitle")}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DataLabel label={t("fields.packageTemplate")}>
                  <select
                    value={packageForm.templateId}
                    onChange={(event) => setPackageTemplate(event.target.value)}
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
                      setPackagePaymentStatus(event.target.value as PaymentStatus)
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

              {selectedPackageTemplate?.tier === "duo" ? (
                <div className="mt-4">
                  <DataLabel label={t("fields.sharedClient")}>
                    <select
                      value={packageForm.sharedClientId}
                      onChange={(event) =>
                        setPackageForm((current) => ({
                          ...current,
                          sharedClientId: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                    >
                      <option value="">{t("common.none")}</option>
                      {availableSharedClients.map((linkedClient) => (
                        <option key={linkedClient.id} value={linkedClient.id}>
                          {linkedClient.fullName}
                        </option>
                      ))}
                    </select>
                  </DataLabel>
                </div>
              ) : null}

              <DataLabel label={t("fields.paymentMethod")}>
                <div className="grid grid-cols-2 gap-2 rounded-full bg-white/75 p-1">
                  {(["card", "cash"] as const).map((paymentMethod) => (
                    <button
                      key={paymentMethod}
                      type="button"
                      onClick={() => setPackagePaymentMethod(paymentMethod)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                        packageForm.paymentMethod === paymentMethod
                          ? "bg-[color:var(--ink)] text-white"
                          : "text-[color:var(--ink)]"
                      }`}
                    >
                      {t(`paymentMethod.${paymentMethod}`)}
                    </button>
                  ))}
                </div>
              </DataLabel>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <DataLabel label={t("fields.purchasedAt")}>
                  <input
                    type="date"
                    lang={locale === "et" ? "et-EE" : "en-GB"}
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
                    lang={locale === "et" ? "et-EE" : "en-GB"}
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
                    lang={locale === "et" ? "et-EE" : "en-GB"}
                    value={packageForm.expiresDate}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, expiresDate: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  />
                </DataLabel>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[0.45fr_0.55fr]">
                <DataLabel label={t("fields.amountPaid")}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packageForm.amountPaid}
                    disabled={packageForm.paymentStatus !== "partial"}
                    onChange={(event) =>
                      setPackageForm((current) => ({ ...current, amountPaid: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none disabled:cursor-not-allowed disabled:bg-[color:var(--sand-2)]/65"
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

      <SectionCard
        title={t("clientProfile.workouts")}
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
                <p className="font-semibold text-[color:var(--ink)]">{t("clientProfile.workoutBlocks")}</p>
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
                  recentSessions
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

          <div>
            <form
              className="rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/55 p-4"
              onSubmit={submitWorkoutEntry}
            >
              <div className="mb-4">
                <p className="font-semibold text-[color:var(--ink)]">{t("forms.workoutSessionTitle")}</p>
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
                  <select
                    value={workoutEntryForm.location}
                    onChange={(event) =>
                      setWorkoutEntryForm((current) => ({
                        ...current,
                        location: event.target.value,
                      }))
                    }
                    disabled={state.trainingLocations.length === 0}
                    className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                  >
                    {state.trainingLocations.length === 0 ? (
                      <option value="">{t("common.none")}</option>
                    ) : null}
                    {state.trainingLocations.map((location) => (
                      <option key={location.id} value={location.name}>
                        {location.name}
                      </option>
                    ))}
                  </select>
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
                    lang={locale === "et" ? "et-EE" : "en-GB"}
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
                    lang={locale === "et" ? "et-EE" : "en-GB"}
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

              {isWorkoutExerciseEditorOpen ? (
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
              ) : null}

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

              {isWorkoutExerciseEditorOpen ? (
                <button
                  type="submit"
                  className="mt-4 rounded-full bg-[color:var(--ink)] px-5 py-3 text-sm font-semibold text-white"
                >
                  {t("forms.workoutSessionSubmit")}
                </button>
              ) : null}
            </form>
          </div>
        </div>
      </SectionCard>

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
            <div className="mb-4">
              <p className="font-semibold text-[color:var(--ink)]">{t("forms.assessmentTitle")}</p>
            </div>

            <DataLabel label={t("fields.assessmentDate")}>
              <input
                type="date"
                lang={locale === "et" ? "et-EE" : "en-GB"}
                value={assessmentForm.recordedDate}
                onChange={(event) =>
                  setAssessmentForm((current) => ({ ...current, recordedDate: event.target.value }))
                }
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
              />
            </DataLabel>

            <div className="mt-4 space-y-3">
              {assessmentForm.metrics.map((metric) => (
                <div
                  key={metric.id}
                  className="rounded-[22px] border border-[color:var(--line-soft)] bg-white/70 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">{metric.label || t("fields.metricLabel")}</p>
                    <button
                      type="button"
                      onClick={() => removeAssessmentMetricField(metric.id)}
                      className="rounded-full border border-[color:var(--line-soft)] bg-white px-3 py-1 text-xs font-semibold text-[color:var(--ink)]"
                    >
                      {t("forms.removeMetric")}
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1.1fr_0.8fr_0.6fr]">
                    <DataLabel label={t("fields.metricLabel")}>
                      <input
                        value={metric.label}
                        onChange={(event) => updateAssessmentMetric(metric.id, { label: event.target.value })}
                        className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                      />
                    </DataLabel>
                    <DataLabel label={t("fields.metricValue")}>
                      <input
                        type="number"
                        step="0.1"
                        value={metric.value}
                        onChange={(event) => updateAssessmentMetric(metric.id, { value: event.target.value })}
                        className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 text-sm outline-none"
                      />
                    </DataLabel>
                    <DataLabel label={t("fields.metricUnit")}>
                      <input
                        value={metric.unit}
                        onChange={(event) => updateAssessmentMetric(metric.id, { unit: event.target.value })}
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
                onClick={addAssessmentMetricField}
                className="rounded-full border border-[color:var(--line-soft)] bg-white px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
              >
                {t("forms.addMetric")}
              </button>
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
        title={t("plans.nutritionPlan")}
        aside={
          isNutritionRefreshing ? (
            <span className="rounded-full bg-[color:var(--sand-2)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]">
              {t("clientProfile.generatingNutrition")}
            </span>
          ) : null
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
              {nutritionMetricCards.map((card) => (
                <NutritionMetricCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  mealBreakdown={card.mealBreakdown}
                />
              ))}
            </div>

            <div className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-5">
              <h3 className="text-xl font-semibold text-[color:var(--ink)]">
                {nutritionPlan.title}
              </h3>

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
          </div>
        ) : (
          <EmptyState
            title={t("plans.nutritionPlan")}
            body={
              assessments.length === 0
                ? t("clientProfile.noNutritionPlanAwaitingAssessment")
                : isNutritionRefreshing
                  ? t("clientProfile.generatingNutrition")
                  : t("clientProfile.noNutritionPlan")
            }
          />
        )}
      </SectionCard>

      <SectionCard
        title={t("clientProfile.workoutRecaps")}
      >
        <div className="space-y-3">
          {workoutRecaps.length === 0 ? (
            <EmptyState title={t("common.none")} body={t("clientProfile.noWorkoutRecaps")} />
          ) : (
            workoutRecaps.map((recap) => {
              const linkedSession = recap.sessionId
                ? state.sessions.find((session) => session.id === recap.sessionId)
                : null;
              const isOpen = openWorkoutRecapId === recap.id;

              return (
                <div
                  key={recap.id}
                  className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-[color:var(--ink)]">
                        {recap.subject || recap.title}
                      </p>
                      <p className="text-sm leading-6 text-[color:var(--muted-ink)]">
                        {linkedSession ? `${linkedSession.title} / ` : ""}
                        {formatDate(recap.updatedAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenWorkoutRecapId((current) => (current === recap.id ? null : recap.id))
                      }
                      className="rounded-full border border-[color:var(--line-soft)] bg-[color:var(--sand-2)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                    >
                      {isOpen
                        ? t("clientProfile.hideWorkoutRecap")
                        : t("clientProfile.openWorkoutRecap")}
                    </button>
                  </div>

                  <div className="mt-3 rounded-2xl bg-[color:var(--sand-2)]/70 px-4 py-3">
                    <p
                      className={`whitespace-pre-wrap text-sm leading-7 text-[color:var(--muted-ink)] ${
                        isOpen ? "" : "line-clamp-4"
                      }`}
                    >
                      {recap.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SectionCard>
    </div>
  );
}
