"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  User as FirebaseAuthUser,
} from "firebase/auth";
import {
  deleteObject,
  listAll,
  ref as storageRef,
  StorageReference,
} from "firebase/storage";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowed-emails";
import { addMinutesToIso, buildIsoFromDateTime } from "@/lib/date";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase/client";
import { saveCRMState, subscribeToCRMState } from "@/lib/firebase/crm-store";
import { initialCRMState } from "@/lib/mock-data";
import { translate } from "@/lib/i18n";
import {
  buildPackageAllocation,
  getClientAssessments,
  getClientNutritionPlans,
  getClientSessions,
  getInvoicePaidAmount,
  getSessionUnitPrice,
  getSessionBundle,
} from "@/lib/selectors";
import {
  AIDraft,
  BodyAssessment,
  CatalogMutationResult,
  CRMState,
  ClientProfile,
  CreateBodyAssessmentInput,
  CreateClientInput,
  CreateLeadInput,
  CreatePackagePurchaseInput,
  CreateWorkoutPlanInput,
  CreateWorkoutSessionInput,
  Locale,
  NutritionPlan,
  PackageTemplateInput,
  PlannedWorkout,
  SessionExercise,
  SessionWorkout,
  TrainingLocation,
  TrainingLocationInput,
} from "@/lib/types";

const STATE_STORAGE_KEY = "atlas-trainer-crm-state";
const LOCALE_STORAGE_KEY = "atlas-trainer-crm-locale";
const FIREBASE_WORKSPACE_ID = process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || "primary";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
  formatCurrency: (value: number) => string;
};

type AuthContextValue = {
  user: FirebaseAuthUser | null;
  loading: boolean;
  error: string | null;
  firebaseConfigured: boolean;
  liveData: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

type CRMContextValue = {
  state: CRMState;
  loading: boolean;
  hydrated: boolean;
  error: string | null;
  persistenceMode: "local" | "firebase";
  createLead: (input: CreateLeadInput) => void;
  createClient: (input: CreateClientInput) => void;
  createClientFromLead: (leadId: string, input: CreateClientInput) => void;
  updateClient: (clientId: string, input: CreateClientInput) => void;
  deleteLead: (leadId: string) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  createPackageTemplate: (input: PackageTemplateInput) => CatalogMutationResult;
  updatePackageTemplate: (
    templateId: string,
    input: PackageTemplateInput,
  ) => CatalogMutationResult;
  deletePackageTemplate: (templateId: string) => CatalogMutationResult;
  createTrainingLocation: (input: TrainingLocationInput) => CatalogMutationResult;
  updateTrainingLocation: (
    locationId: string,
    input: TrainingLocationInput,
  ) => CatalogMutationResult;
  deleteTrainingLocation: (locationId: string) => CatalogMutationResult;
  addPackagePurchase: (input: CreatePackagePurchaseInput) => void;
  addBodyAssessment: (input: CreateBodyAssessmentInput) => BodyAssessment | null;
  addWorkoutPlan: (input: CreateWorkoutPlanInput) => void;
  addWorkoutSession: (input: CreateWorkoutSessionInput) => void;
  updateSessionSchedule: (args: {
    sessionId: string;
    sessionDate: string;
    startTime: string;
    durationMinutes: number;
    location: string;
  }) => void;
  convertLeadToClient: (leadId: string) => void;
  updateLeadStatus: (leadId: string, status: CreateLeadInput["status"]) => void;
  markReminderDone: (reminderId: string) => void;
  updateSessionNote: (
    sessionId: string,
    field: "coachNote" | "athleteFacingNote",
    value: string,
  ) => void;
  updateExerciseNote: (sessionId: string, exerciseId: string, note: string) => void;
  updateSet: (
    sessionId: string,
    exerciseId: string,
    setId: string,
    patch: Partial<SessionExercise["sets"][number]>,
  ) => void;
  toggleExerciseState: (
    sessionId: string,
    exerciseId: string,
    state: SessionExercise["status"],
  ) => void;
  addExercise: (sessionId: string, name: string) => void;
  regenerateSessionWorkout: (args: {
    sessionId: string;
    instructions: string;
  }) => Promise<void>;
  completeSession: (sessionId: string) => Promise<void>;
  refreshNutritionPlan: (args: {
    clientId: string;
    clientOverride?: ClientProfile;
    assessmentsOverride?: BodyAssessment[];
    trigger?: "assessment-update" | "assessment-backfill";
  }) => Promise<void>;
  upsertDraft: (draft: AIDraft) => void;
  updateDraft: (draftId: string, patch: Partial<AIDraft>) => void;
  sendDraftToTimeline: (draftId: string) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const AuthContext = createContext<AuthContextValue | null>(null);
const CRMContext = createContext<CRMContextValue | null>(null);

function cloneInitialState(): CRMState {
  return structuredClone(initialCRMState);
}

function createCatalogSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCatalogName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sortPackageTemplates(templates: CRMState["packageTemplates"]) {
  const kindOrder: Record<CreateWorkoutSessionInput["kind"], number> = {
    solo: 0,
    duo: 1,
    group: 2,
  };

  return [...templates].sort((left, right) => {
    const kindDelta = kindOrder[left.tier] - kindOrder[right.tier];
    if (kindDelta !== 0) {
      return kindDelta;
    }

    if (left.sessionCount !== right.sessionCount) {
      return left.sessionCount - right.sessionCount;
    }

    if (left.price !== right.price) {
      return left.price - right.price;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortTrainingLocations(trainingLocations: TrainingLocation[]) {
  return [...trainingLocations].sort((left, right) => left.name.localeCompare(right.name));
}

function buildTrainingLocations(
  existingLocations: TrainingLocation[] | undefined,
  sessions: CRMState["sessions"],
) {
  const seen = new Set<string>();
  const nextLocations: TrainingLocation[] = [];

  const register = (name: string, id?: string) => {
    const normalizedName = normalizeCatalogName(name);
    if (!normalizedName) {
      return;
    }

    const key = normalizedName.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    nextLocations.push({
      id:
        id?.trim() ||
        `location-${createCatalogSlug(normalizedName) || crypto.randomUUID()}`,
      name: normalizedName,
    });
  };

  existingLocations?.forEach((location) => register(location.name, location.id));
  sessions.forEach((session) => register(session.location));

  return sortTrainingLocations(nextLocations);
}

function normalizeCRMState(state: CRMState) {
  const baseState = cloneInitialState();
  const mergedState = {
    ...baseState,
    ...state,
  };

  return {
    ...mergedState,
    trainingLocations: buildTrainingLocations(
      (state as Partial<CRMState>).trainingLocations,
      mergedState.sessions,
    ),
  };
}

function loadInitialState(firebaseConfigured: boolean): CRMState {
  if (typeof window === "undefined" || firebaseConfigured) {
    return cloneInitialState();
  }

  const rawState = localStorage.getItem(STATE_STORAGE_KEY);
  return rawState ? normalizeCRMState(JSON.parse(rawState) as CRMState) : cloneInitialState();
}

function timestamp() {
  return new Date().toISOString();
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function subtractHours(value: string, hours: number) {
  const date = new Date(value);
  date.setUTCHours(date.getUTCHours() - hours);
  return date.toISOString();
}

type StarterWorkoutDraft = {
  planTitle: string;
  planGoal: string;
  focusAreas: string[];
  sessionPattern: string[];
  sessionTitle: string;
  sessionObjective: string;
  sessionKind: CreateWorkoutSessionInput["kind"];
  coachNote: string;
  sessionNote: string;
  exercises: CreateWorkoutSessionInput["exercises"];
};

function buildStarterSet(label: string, reps: string, rpe?: number, tempo?: string) {
  return {
    label,
    reps,
    rpe,
    tempo,
  };
}

function buildLocalStarterWorkout(client: ClientProfile): StarterWorkoutDraft {
  const locale = client.preferredLanguage;
  const profileText = [
    client.gender,
    ...client.tags,
    ...client.goals,
    client.notes,
    ...client.healthFlags.map((flag) => `${flag.title} ${flag.detail}`),
  ]
    .join(" ")
    .toLowerCase();
  const wantsLowerBody = /lower-body|lower body|glute|leg|waist|fat loss/i.test(profileText);
  const wantsPosture = /posture|desk|thoracic|neck|shoulder/i.test(profileText);
  const wantsCore = /core|postpartum|stability/i.test(profileText);
  const isBeginner = /beginner|confidence|machine|first gym/i.test(profileText);
  const sessionKind = /\bduo\b|friend|partner/i.test(profileText)
    ? "duo"
    : /group|small group|micro-group/i.test(profileText)
      ? "group"
      : "solo";
  const primaryGoal =
    client.goals[0]?.trim() ||
    (locale === "et" ? "järjepidev treeningurutiin" : "a consistent training routine");

  const baseExercises: CreateWorkoutSessionInput["exercises"] = wantsLowerBody
    ? [
        {
          name: locale === "et" ? "Dead bug" : "Dead bug",
          focus: locale === "et" ? "Kere kontroll" : "Core control",
          sets: [buildStarterSet("1", "6/6", 5, "slow"), buildStarterSet("2", "6/6", 5, "slow")],
        },
        {
          name: locale === "et" ? "Karikakükk" : "Goblet squat",
          focus: locale === "et" ? "Alakeha baasjõud" : "Lower-body strength base",
          sets: [buildStarterSet("1", "8", 6, "3111"), buildStarterSet("2", "8", 6, "3111"), buildStarterSet("3", "8", 7, "3111")],
        },
        {
          name:
            locale === "et"
              ? "Rumeenia jõutõmme hantlitega"
              : "Dumbbell Romanian deadlift",
          focus: locale === "et" ? "Tagakett" : "Posterior chain",
          sets: [buildStarterSet("1", "8", 6), buildStarterSet("2", "8", 6), buildStarterSet("3", "8", 7)],
        },
        {
          name: locale === "et" ? "Istudes sõudmine" : "Seated row",
          focus: locale === "et" ? "Ülaselg" : "Upper-back support",
          sets: [buildStarterSet("1", "10", 6), buildStarterSet("2", "10", 6), buildStarterSet("3", "10", 7)],
        },
        {
          name: locale === "et" ? "Pallof press" : "Pallof press",
          focus: locale === "et" ? "Pöördevastane kere töö" : "Anti-rotation core work",
          sets: [buildStarterSet("1", "10/10", 6), buildStarterSet("2", "10/10", 6)],
        },
      ]
    : wantsPosture
      ? [
          {
            name: "Dead bug",
            focus: locale === "et" ? "Kere pinge" : "Core tension",
            sets: [buildStarterSet("1", "6/6", 5, "slow"), buildStarterSet("2", "6/6", 5, "slow")],
          },
          {
            name: locale === "et" ? "Karikakükk" : "Goblet squat",
            focus: locale === "et" ? "Täiskeha baas" : "Full-body foundation",
            sets: [buildStarterSet("1", "8", 6, "3011"), buildStarterSet("2", "8", 6, "3011"), buildStarterSet("3", "8", 7, "3011")],
          },
          {
            name:
              locale === "et"
                ? "Kaldpingil hantlitega surumine"
                : "Incline dumbbell press",
            focus: locale === "et" ? "Õlasõbralik surumine" : "Shoulder-friendly press",
            sets: [buildStarterSet("1", "8", 6), buildStarterSet("2", "8", 6), buildStarterSet("3", "8", 7)],
          },
          {
            name:
              locale === "et"
                ? "Rinnatoega sõudmine"
                : "Chest-supported row",
            focus: locale === "et" ? "Rüht ja ülaselg" : "Posture and upper-back strength",
            sets: [buildStarterSet("1", "10", 6), buildStarterSet("2", "10", 6), buildStarterSet("3", "10", 7)],
          },
          {
            name: locale === "et" ? "Farmeri kand" : "Farmer carry",
            focus: locale === "et" ? "Tervikkeha pinge" : "Whole-body tension",
            sets: [buildStarterSet("1", "25 m", 6), buildStarterSet("2", "25 m", 7)],
          },
        ]
      : wantsCore
        ? [
            {
              name:
                locale === "et"
                  ? "Hingamine + dead bug"
                  : "Breathing dead bug",
              focus: locale === "et" ? "Kere kontroll ja hingamine" : "Breathing and core control",
              sets: [buildStarterSet("1", "6/6", 5, "slow"), buildStarterSet("2", "6/6", 5, "slow")],
            },
            {
              name:
                locale === "et"
                  ? "Karikakükk kastile"
                  : "Goblet squat to box",
              focus: locale === "et" ? "Turvaline küki muster" : "Safe squat pattern",
              sets: [buildStarterSet("1", "8", 6, "3111"), buildStarterSet("2", "8", 6, "3111"), buildStarterSet("3", "8", 7, "3111")],
            },
            {
              name: locale === "et" ? "Istudes sõudmine" : "Seated row",
              focus: locale === "et" ? "Ülaselja kontroll" : "Upper-back control",
              sets: [buildStarterSet("1", "10", 6), buildStarterSet("2", "10", 6), buildStarterSet("3", "10", 7)],
            },
            {
              name:
                locale === "et"
                  ? "Rumeenia jõutõmme hantlitega"
                  : "Dumbbell Romanian deadlift",
              focus: locale === "et" ? "Puusahinge baas" : "Hip-hinge foundation",
              sets: [buildStarterSet("1", "8", 6), buildStarterSet("2", "8", 6), buildStarterSet("3", "8", 7)],
            },
            {
              name: locale === "et" ? "Kohverkand" : "Suitcase carry",
              focus: locale === "et" ? "Kere stabiilsus" : "Core stability",
              sets: [buildStarterSet("1", "20 m / side", 6), buildStarterSet("2", "20 m / side", 6)],
            },
          ]
        : [
            {
              name: "Dead bug",
              focus: locale === "et" ? "Kere kontroll" : "Core control",
              sets: [buildStarterSet("1", "6/6", 5, "slow"), buildStarterSet("2", "6/6", 5, "slow")],
            },
            {
              name: isBeginner
                ? locale === "et"
                  ? "Jalapress"
                  : "Leg press"
                : locale === "et"
                  ? "Karikakükk"
                  : "Goblet squat",
              focus: locale === "et" ? "Alakeha baas" : "Lower-body foundation",
              sets: [buildStarterSet("1", "10", 6), buildStarterSet("2", "10", 6), buildStarterSet("3", "10", 7)],
            },
            {
              name:
                locale === "et"
                  ? "Rumeenia jõutõmme hantlitega"
                  : "Dumbbell Romanian deadlift",
              focus: locale === "et" ? "Puusahing" : "Hip hinge pattern",
              sets: [buildStarterSet("1", "8", 6), buildStarterSet("2", "8", 6), buildStarterSet("3", "8", 7)],
            },
            {
              name: locale === "et" ? "Istudes sõudmine" : "Seated row",
              focus: locale === "et" ? "Ülaselg" : "Upper-back support",
              sets: [buildStarterSet("1", "10", 6), buildStarterSet("2", "10", 6), buildStarterSet("3", "10", 7)],
            },
            {
              name:
                locale === "et"
                  ? "Kaldpingil hantlitega surumine"
                  : "Incline dumbbell press",
              focus: locale === "et" ? "Turvaline ülakeha töö" : "Simple press pattern",
              sets: [buildStarterSet("1", "8", 6), buildStarterSet("2", "8", 6), buildStarterSet("3", "8", 7)],
            },
          ];

  return {
    planTitle:
      locale === "et" ? `Alustusplokk: ${primaryGoal}` : `Starter block: ${primaryGoal}`,
    planGoal:
      locale === "et"
        ? `Loo turvaline esimene treeningupõhi eesmärgiga ${primaryGoal.toLowerCase()}.`
        : `Build a safe first-session baseline around ${primaryGoal.toLowerCase()}.`,
    focusAreas:
      locale === "et"
        ? ["Liigutuste tehnika", "Mõõdukas koormus", "Treeningtaluvuse jälgimine"]
        : ["Technique quality", "Moderate loading", "Readiness tracking"],
    sessionPattern:
      locale === "et"
        ? ["Täiskeha baas", "5 põhiharjutust", "Koormus tunnetuse järgi"]
        : ["Full-body foundation", "5 core exercises", "Load guided by feel"],
    sessionTitle:
      locale === "et"
        ? "1. treening: tehnika ja baastaseme hindamine"
        : "Session 1: technique and baseline assessment",
    sessionObjective:
      locale === "et"
        ? "Õpeta 5 põhiharjutust ja salvesta kliendi esimene töökindel algtase."
        : "Teach 5 core exercises and capture the client's first reliable baseline.",
    sessionKind,
    coachNote:
      locale === "et"
        ? "Hoia esimene treening mõõdukas ja kasuta seda baasliigutuste kvaliteedi ning koormustaluvuse hindamiseks."
        : "Keep the first session moderate and use it to assess movement quality and load tolerance.",
    sessionNote:
      locale === "et"
        ? "Esimene AI treening on loodud. Lisa aeg ja toimumiskoht enne kalendrisse kinnitamist."
        : "The first AI workout has been created. Add time and location before locking it into the calendar.",
    exercises: baseExercises.slice(0, 5),
  };
}

function randomHue() {
  return Math.floor(Math.random() * 360);
}

function clampAmount(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(max, Math.max(0, Math.round(value * 100) / 100));
}

function buildClientProfileFromLead(
  lead: CreateLeadInput | CRMState["leads"][number],
  ownerId: string,
): ClientProfile {
  return {
    id: `client-${crypto.randomUUID()}`,
    originLeadId: "id" in lead ? lead.id : undefined,
    fullName: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    gender: "unspecified",
    preferredLanguage: lead.preferredLanguage,
    goals: [lead.goal].filter(Boolean),
    tags: ["new-client"],
    joinedAt: timestamp(),
    consentStatus: "pending",
    healthFlags: [],
    notes: lead.notes,
    ownerId,
    avatarHue: randomHue(),
  };
}

function clientHasTraining(previous: CRMState, clientId: string) {
  return (
    previous.workoutPlans.some(
      (plan) => plan.clientId === clientId && plan.status === "active",
    ) ||
    previous.sessions.some(
      (session) =>
        session.primaryClientId === clientId || session.clientIds.includes(clientId),
    )
  );
}

function getReplaceableStarterTraining(previous: CRMState, clientId: string) {
  const activePlan = previous.workoutPlans.find(
    (plan) =>
      plan.clientId === clientId && plan.status === "active" && plan.origin === "ai",
  );
  if (!activePlan) {
    return null;
  }

  const starterPlannedWorkouts = previous.plannedWorkouts.filter(
    (workout) => workout.clientId === clientId && workout.sourcePlanId === activePlan.id,
  );
  if (starterPlannedWorkouts.length === 0) {
    return null;
  }

  const starterSessionIds = new Set(starterPlannedWorkouts.map((workout) => workout.sessionId));
  const starterSessions = previous.sessions.filter((session) => starterSessionIds.has(session.id));
  if (starterSessions.length === 0) {
    return null;
  }

  const hasLockedStarterSession = starterSessions.some(
    (session) =>
      session.status !== "planned" ||
      Boolean(session.startAt) ||
      Boolean(session.endAt) ||
      Boolean(session.location) ||
      Boolean(session.packagePurchaseId),
  );

  if (hasLockedStarterSession) {
    return null;
  }

  const hasAdditionalClientSessions = previous.sessions.some(
    (session) =>
      (session.primaryClientId === clientId || session.clientIds.includes(clientId)) &&
      !starterSessionIds.has(session.id),
  );

  if (hasAdditionalClientSessions) {
    return null;
  }

  return {
    activePlanId: activePlan.id,
    plannedWorkoutIds: new Set(starterPlannedWorkouts.map((workout) => workout.id)),
    sessionIds: starterSessionIds,
    sessionWorkoutIds: new Set(
      starterSessions
        .map((session) => session.sessionWorkoutId)
        .filter((value): value is string => Boolean(value)),
    ),
    reminderIds: new Set(
      previous.reminders
        .filter(
          (reminder) => Boolean(reminder.sessionId) && starterSessionIds.has(reminder.sessionId!),
        )
        .map((reminder) => reminder.id),
    ),
  };
}

function applyStarterWorkoutState(
  previous: CRMState,
  client: ClientProfile,
  workout: StarterWorkoutDraft,
  options?: {
    replaceExistingStarter?: boolean;
  },
) {
  let baseState = previous;

  if (options?.replaceExistingStarter) {
    const replaceableStarter = getReplaceableStarterTraining(previous, client.id);
    if (replaceableStarter) {
      baseState = {
        ...previous,
        workoutPlans: previous.workoutPlans.filter(
          (plan) => plan.id !== replaceableStarter.activePlanId,
        ),
        sessions: previous.sessions.filter(
          (session) => !replaceableStarter.sessionIds.has(session.id),
        ),
        plannedWorkouts: previous.plannedWorkouts.filter(
          (plannedWorkout) => !replaceableStarter.plannedWorkoutIds.has(plannedWorkout.id),
        ),
        sessionWorkouts: previous.sessionWorkouts.filter(
          (sessionWorkout) => !replaceableStarter.sessionWorkoutIds.has(sessionWorkout.id),
        ),
        reminders: previous.reminders.filter(
          (reminder) => !replaceableStarter.reminderIds.has(reminder.id),
        ),
      };
    } else if (clientHasTraining(previous, client.id)) {
      return previous;
    }
  } else if (clientHasTraining(previous, client.id)) {
    return previous;
  }

  const now = timestamp();
  const nextPlanId = `wp-${crypto.randomUUID()}`;
  const nextPlan = {
    id: nextPlanId,
    clientId: client.id,
    title: workout.planTitle.trim(),
    status: "active" as const,
    goal: workout.planGoal.trim(),
    focusAreas: workout.focusAreas.filter(Boolean),
    sessionPattern: workout.sessionPattern.filter(Boolean),
    activeFrom: client.joinedAt,
    createdAt: now,
    updatedAt: now,
    origin: "ai" as const,
  };

  const withPlan = {
    ...baseState,
    workoutPlans: [
      nextPlan,
      ...baseState.workoutPlans.map((plan) =>
        plan.clientId === client.id && plan.status === "active"
          ? {
              ...plan,
              status: "archived" as const,
              updatedAt: now,
            }
          : plan,
      ),
    ],
    activityEvents: [
      {
        id: `act-${crypto.randomUUID()}`,
        actor: "AI",
        clientId: client.id,
        type: "workout-plan.created",
        detail: `Generated the initial workout block for ${client.fullName}.`,
        createdAt: now,
      },
      ...baseState.activityEvents,
    ],
  };

  return createWorkoutSessionState(
    withPlan,
    {
      clientId: client.id,
      title: workout.sessionTitle,
      objective: workout.sessionObjective,
      startAt: "",
      endAt: "",
      kind: workout.sessionKind,
      status: "planned",
      location: "",
      coachNote: workout.coachNote,
      sessionNote: workout.sessionNote,
      exercises: workout.exercises,
    },
    "AI",
    {
      sourcePlanId: nextPlanId,
      activityType: "session.planned",
      activityDetail: `AI generated the first workout for ${client.fullName}.`,
      skipScheduleValidation: true,
    },
  );
}

function createNewSet(label: string) {
  return {
    id: `set-${crypto.randomUUID()}`,
    label,
    targetReps: "8",
    actualReps: "8",
    targetWeightKg: undefined,
    actualWeightKg: undefined,
    completed: false,
  };
}

function deriveExerciseStatus(exercise: SessionExercise): SessionExercise["status"] {
  if (exercise.status === "added" || exercise.status === "skipped") {
    return exercise.status;
  }

  const done = exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
  const changed = exercise.sets.some(
    (set) =>
      set.actualReps !== set.targetReps ||
      set.actualWeightKg !== set.targetWeightKg ||
      Boolean(set.note),
  );

  if (done && !changed) {
    return "completed";
  }

  if (done) {
    return "modified";
  }

  return changed ? "modified" : "planned";
}

function normalizeWorkoutExercises(input: CreateWorkoutSessionInput["exercises"]) {
  return input
    .map((exercise) => ({
      ...exercise,
      name: exercise.name.trim(),
      focus: exercise.focus?.trim() || undefined,
      note: exercise.note?.trim() || undefined,
      sets: exercise.sets
        .map((set, index) => ({
          ...set,
          label: set.label.trim() || String(index + 1),
          reps: set.reps.trim(),
          tempo: set.tempo?.trim() || undefined,
          note: set.note?.trim() || undefined,
        }))
        .filter((set) => set.reps),
    }))
    .filter((exercise) => exercise.name && exercise.sets.length > 0);
}

function updateWorkout(
  state: CRMState,
  sessionId: string,
  updater: (workout: SessionWorkout) => SessionWorkout,
) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session?.sessionWorkoutId) {
    return state;
  }

  return {
    ...state,
    sessionWorkouts: state.sessionWorkouts.map((workout) =>
      workout.id === session.sessionWorkoutId
        ? updater({ ...workout, updatedAt: timestamp() })
        : workout,
    ),
  };
}

function createWorkoutSessionState(
  previous: CRMState,
  input: CreateWorkoutSessionInput,
  actor: string,
  options?: {
    sourcePlanId?: string;
    activityType?: string;
    activityDetail?: string;
    skipScheduleValidation?: boolean;
  },
): CRMState {
  const exercises = normalizeWorkoutExercises(input.exercises);
  const normalizedLocation = normalizeCatalogName(input.location);

  if (
    !input.title.trim() ||
    (!options?.skipScheduleValidation && (!input.startAt || !input.endAt || !normalizedLocation)) ||
    exercises.length === 0
  ) {
    return previous;
  }

  const now = timestamp();
  const sessionId = `session-${crypto.randomUUID()}`;
  const plannedWorkoutId = `pw-${crypto.randomUUID()}`;
  const sessionWorkoutId = `sw-${crypto.randomUUID()}`;
  const sourcePlanId =
    options?.sourcePlanId ??
    previous.workoutPlans.find(
      (plan) => plan.clientId === input.clientId && plan.status === "active",
    )?.id ??
    undefined;
  const plannedWorkout = {
    id: plannedWorkoutId,
    clientId: input.clientId,
    sessionId,
    sourcePlanId,
    title: input.title.trim(),
    objective: input.objective.trim(),
    createdAt: now,
    exercises: exercises.map((exercise) => ({
      id: `pex-${crypto.randomUUID()}`,
      name: exercise.name,
      focus: exercise.focus,
      note: exercise.note,
      sets: exercise.sets.map((set) => ({
        id: `ps-${crypto.randomUUID()}`,
        label: set.label,
        reps: set.reps,
        weightKg: set.weightKg,
        tempo: set.tempo,
        rpe: set.rpe,
        note: set.note,
      })),
    })),
  };
  const sessionWorkout: SessionWorkout = {
    id: sessionWorkoutId,
    sessionId,
    title: input.title.trim(),
    status: input.status === "completed" ? "completed" : "draft",
    exercises: plannedWorkout.exercises.map((exercise) => ({
      id: `sex-${crypto.randomUUID()}`,
      plannedExerciseId: exercise.id,
      name: exercise.name,
      status: input.status === "completed" ? "completed" : "planned",
      note: exercise.note,
      sets: exercise.sets.map((set) => ({
        id: `set-${crypto.randomUUID()}`,
        label: set.label,
        targetReps: set.reps,
        actualReps: set.reps,
        targetWeightKg: set.weightKg,
        actualWeightKg: set.weightKg,
        tempo: set.tempo,
        rpe: set.rpe,
        completed: input.status === "completed",
        note: set.note,
      })),
    })),
    coachNote: input.coachNote?.trim() ?? "",
    athleteFacingNote: "",
    updatedAt: now,
  };
  const reminderAt =
    input.status === "planned" && input.startAt
      ? subtractHours(input.startAt, 24)
      : undefined;
  const hasLocation =
    normalizedLocation.length > 0 &&
    previous.trainingLocations.some(
      (location) => location.name.toLowerCase() === normalizedLocation.toLowerCase(),
    );
  const trainingLocations =
    normalizedLocation.length === 0 || hasLocation
      ? previous.trainingLocations
      : sortTrainingLocations([
          ...previous.trainingLocations,
          {
            id: `location-${crypto.randomUUID()}`,
            name: normalizedLocation,
          },
        ]);
  const nextSession = {
    id: sessionId,
    title: input.title.trim(),
    coachId: previous.users[0]?.id ?? "user-maria",
    primaryClientId: input.clientId,
    clientIds: [input.clientId],
    kind: input.kind,
    startAt: input.startAt,
    endAt: input.endAt,
    location: normalizedLocation,
    status: input.status,
    packagePurchaseId: input.packagePurchaseId,
    plannedWorkoutId,
    sessionWorkoutId,
    reminderAt,
    calendarSync: "manual" as const,
    note: input.sessionNote?.trim() || input.objective.trim() || undefined,
  };

  return reconcileBillingState({
    ...previous,
    trainingLocations,
    sessions: [nextSession, ...previous.sessions],
    plannedWorkouts: [plannedWorkout, ...previous.plannedWorkouts],
    sessionWorkouts: [sessionWorkout, ...previous.sessionWorkouts],
    reminders:
      input.status === "planned" && reminderAt
        ? [
            {
              id: `rem-${crypto.randomUUID()}`,
              clientId: input.clientId,
              sessionId,
              title: "24h reminder",
              dueAt: reminderAt,
              channel: "calendar",
              status: "scheduled",
            },
            ...previous.reminders,
          ]
        : previous.reminders,
    activityEvents: [
      {
        id: `act-${crypto.randomUUID()}`,
        actor,
        clientId: input.clientId,
        type:
          options?.activityType ??
          (input.status === "completed" ? "session.logged" : "session.planned"),
        detail:
          options?.activityDetail ??
          (input.status === "completed"
            ? `Logged historical workout ${input.title.trim()}.`
            : `Planned workout ${input.title.trim()} from the client profile.`),
        createdAt: now,
      },
      ...previous.activityEvents,
    ],
  });
}

function deriveInvoicePaymentStatus(
  fallbackStatus: CRMState["invoiceRecords"][number]["paymentStatus"],
  paidAmount: number,
  totalAmount: number,
): CRMState["invoiceRecords"][number]["paymentStatus"] {
  if (paidAmount >= totalAmount) {
    return "paid";
  }

  if (paidAmount > 0) {
    return fallbackStatus === "overdue" ? "overdue" : "partial";
  }

  return fallbackStatus === "overdue" ? "overdue" : "pending";
}

function reconcileBillingState(previous: CRMState): CRMState {
  const allocation = buildPackageAllocation(previous);
  const existingInvoices = previous.invoiceRecords;

  const packageInvoices: CRMState["invoiceRecords"] = previous.packagePurchases.map((purchase) => {
    const existingInvoice =
      existingInvoices.find(
        (invoice) =>
          (invoice.source ?? "package") === "package" &&
          (invoice.packagePurchaseId === purchase.id || invoice.id === purchase.invoiceId),
      ) ?? null;
    const invoiceId = existingInvoice?.id ?? purchase.invoiceId;
    const paidAmount = getInvoicePaidAmount(previous, invoiceId);
    const paymentStatus = deriveInvoicePaymentStatus(
      existingInvoice?.paymentStatus ?? purchase.paymentStatus,
      paidAmount,
      purchase.price,
    );

    return {
      id: invoiceId,
      clientId: purchase.clientId,
      packagePurchaseId: purchase.id,
      issuedAt: existingInvoice?.issuedAt ?? purchase.purchasedAt,
      dueAt: existingInvoice?.dueAt ?? addDays(purchase.purchasedAt, 3),
      amount: purchase.price,
      currency: "EUR",
      paymentStatus,
      source: "package",
      description: existingInvoice?.description,
    };
  });

  const sessionDebtInvoices: CRMState["invoiceRecords"] = previous.sessions
    .filter((session) => session.status === "completed")
    .filter((session) => !allocation.packageBySessionId[session.id])
    .map((session) => {
      const existingInvoice =
        existingInvoices.find(
          (invoice) => invoice.source === "session-debt" && invoice.sessionId === session.id,
        ) ?? null;
      const billingMoment = session.endAt || session.startAt || timestamp();
      const amount =
        allocation.uncoveredAmountBySessionId[session.id] ??
        getSessionUnitPrice(previous, session.kind);
      const invoiceId = existingInvoice?.id ?? `inv-session-${crypto.randomUUID()}`;
      const paidAmount = getInvoicePaidAmount(previous, invoiceId);

      return {
        id: invoiceId,
        clientId: session.primaryClientId,
        sessionId: session.id,
        issuedAt: existingInvoice?.issuedAt ?? billingMoment,
        dueAt: existingInvoice?.dueAt ?? billingMoment,
        amount,
        currency: "EUR",
        paymentStatus: deriveInvoicePaymentStatus(
          existingInvoice?.paymentStatus ?? "overdue",
          paidAmount,
          amount,
        ),
        source: "session-debt" as const,
        description: `Uncovered ${session.kind} session: ${session.title}`,
      };
    });

  const nextInvoiceRecords = [...sessionDebtInvoices, ...packageInvoices].sort((left, right) => {
    const leftKey = left.issuedAt || left.dueAt;
    const rightKey = right.issuedAt || right.dueAt;
    return rightKey.localeCompare(leftKey);
  });

  return {
    ...previous,
    sessions: previous.sessions.map((session) =>
      session.status === "completed"
        ? {
            ...session,
            packagePurchaseId: allocation.packageBySessionId[session.id],
          }
        : session,
    ),
    packagePurchases: previous.packagePurchases.map((purchase) => {
      const linkedInvoice = packageInvoices.find((invoice) => invoice.packagePurchaseId === purchase.id);
      return {
        ...purchase,
        usedUnits: allocation.usedUnitsByPurchaseId[purchase.id] ?? 0,
        paymentStatus: linkedInvoice?.paymentStatus ?? purchase.paymentStatus,
        invoiceId: linkedInvoice?.id ?? purchase.invoiceId,
      };
    }),
    invoiceRecords: nextInvoiceRecords,
  };
}

type GeneratedSessionDraft = Pick<
  StarterWorkoutDraft,
  "sessionTitle" | "sessionObjective" | "sessionKind" | "coachNote" | "sessionNote" | "exercises"
>;

function getActiveWorkoutPlan(previous: CRMState, clientId: string) {
  return previous.workoutPlans.find(
    (plan) => plan.clientId === clientId && plan.status === "active",
  );
}

function getReplaceableQueuedSession(previous: CRMState, clientId: string) {
  return [...previous.sessions]
    .filter(
      (session) =>
        (session.primaryClientId === clientId || session.clientIds.includes(clientId)) &&
        session.status === "planned",
    )
    .sort((left, right) => {
      const leftKey = left.startAt || "9999-12-31T23:59:59.999Z";
      const rightKey = right.startAt || "9999-12-31T23:59:59.999Z";
      return leftKey.localeCompare(rightKey);
    })[0];
}

function getRecentCompletedSessionBundles(
  previous: CRMState,
  clientId: string,
  limit = 7,
) {
  return previous.sessions
    .filter(
      (session) =>
        (session.primaryClientId === clientId || session.clientIds.includes(clientId)) &&
        session.status === "completed",
    )
    .map((session) => getSessionBundle(previous, session.id))
    .filter((bundle) => Boolean(bundle?.client?.id === clientId))
    .sort((left, right) => {
      if (!left || !right) {
        return 0;
      }
      const leftKey =
        left.session.endAt || left.session.startAt || left.sessionWorkout?.updatedAt || "";
      const rightKey =
        right.session.endAt || right.session.startAt || right.sessionWorkout?.updatedAt || "";
      return rightKey.localeCompare(leftKey);
    })
    .slice(0, limit)
    .flatMap((bundle) =>
      bundle
        ? [
            {
              session: bundle.session,
              plannedWorkout: bundle.plannedWorkout,
              sessionWorkout: bundle.sessionWorkout,
            },
          ]
        : [],
    );
}

function replaceSessionWorkoutState(
  previous: CRMState,
  sessionId: string,
  workout: GeneratedSessionDraft,
  actor: string,
  options?: {
    activityType?: string;
    activityDetail?: string;
  },
): CRMState {
  const session = previous.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return previous;
  }

  const exercises = normalizeWorkoutExercises(workout.exercises);
  if (!workout.sessionTitle.trim() || !workout.sessionObjective.trim() || exercises.length === 0) {
    return previous;
  }

  const now = timestamp();
  const currentPlannedWorkout = previous.plannedWorkouts.find(
    (item) => item.id === session.plannedWorkoutId,
  );
  const currentSessionWorkout = previous.sessionWorkouts.find(
    (item) => item.id === session.sessionWorkoutId,
  );
  const plannedWorkoutId = `pw-${crypto.randomUUID()}`;
  const sessionWorkoutId = `sw-${crypto.randomUUID()}`;
  const plannedWorkout: PlannedWorkout = {
    id: plannedWorkoutId,
    clientId: session.primaryClientId,
    sessionId: session.id,
    sourcePlanId:
      currentPlannedWorkout?.sourcePlanId ??
      getActiveWorkoutPlan(previous, session.primaryClientId)?.id,
    title: workout.sessionTitle.trim(),
    objective: workout.sessionObjective.trim(),
    createdAt: now,
    exercises: exercises.map((exercise) => ({
      id: `pex-${crypto.randomUUID()}`,
      name: exercise.name,
      focus: exercise.focus,
      note: exercise.note,
      sets: exercise.sets.map((set) => ({
        id: `ps-${crypto.randomUUID()}`,
        label: set.label,
        reps: set.reps,
        weightKg: set.weightKg,
        tempo: set.tempo,
        rpe: set.rpe,
        note: set.note,
      })),
    })),
  };
  const sessionWorkoutStatus: SessionWorkout["status"] =
    session.status === "completed"
      ? "completed"
      : session.status === "in-progress"
        ? "live"
        : "draft";
  const markCompleted = session.status === "completed";
  const nextSessionWorkout: SessionWorkout = {
    id: sessionWorkoutId,
    sessionId: session.id,
    title: workout.sessionTitle.trim(),
    status: sessionWorkoutStatus,
    exercises: plannedWorkout.exercises.map((exercise) => ({
      id: `sex-${crypto.randomUUID()}`,
      plannedExerciseId: exercise.id,
      name: exercise.name,
      status: markCompleted ? "completed" : "planned",
      note: exercise.note,
      sets: exercise.sets.map((set) => ({
        id: `set-${crypto.randomUUID()}`,
        label: set.label,
        targetReps: set.reps,
        actualReps: set.reps,
        targetWeightKg: set.weightKg,
        actualWeightKg: set.weightKg,
        tempo: set.tempo,
        rpe: set.rpe,
        completed: markCompleted,
        note: set.note,
      })),
    })),
    coachNote: workout.coachNote.trim(),
    athleteFacingNote: "",
    updatedAt: now,
  };

  return {
    ...previous,
    sessions: previous.sessions.map((item) =>
      item.id === sessionId
        ? {
            ...item,
            title: workout.sessionTitle.trim(),
            kind: workout.sessionKind,
            plannedWorkoutId,
            sessionWorkoutId,
            note: workout.sessionNote.trim() || workout.sessionObjective.trim() || item.note,
          }
        : item,
    ),
    plannedWorkouts: [
      plannedWorkout,
      ...previous.plannedWorkouts.filter((item) => item.id !== currentPlannedWorkout?.id),
    ],
    sessionWorkouts: [
      nextSessionWorkout,
      ...previous.sessionWorkouts.filter((item) => item.id !== currentSessionWorkout?.id),
    ],
    aiDrafts: previous.aiDrafts.filter((draft) => draft.sessionId !== sessionId),
    activityEvents: [
      {
        id: `act-${crypto.randomUUID()}`,
        actor,
        clientId: session.primaryClientId,
        type: options?.activityType ?? "session.updated",
        detail:
          options?.activityDetail ??
          `AI rebuilt the workout structure for ${session.title}.`,
        createdAt: now,
      },
      ...previous.activityEvents,
    ],
  };
}

function upsertGeneratedNextSession(
  previous: CRMState,
  clientId: string,
  workout: GeneratedSessionDraft,
  actor: string,
) {
  const client = previous.clients.find((item) => item.id === clientId);
  if (!client) {
    return previous;
  }

  const replaceableSession = getReplaceableQueuedSession(previous, clientId);
  if (replaceableSession) {
    return replaceSessionWorkoutState(previous, replaceableSession.id, workout, actor, {
      activityType: "session.planned",
      activityDetail: `AI refreshed the queued next workout for ${client.fullName}.`,
    });
  }

  return createWorkoutSessionState(
    previous,
    {
      clientId,
      title: workout.sessionTitle,
      objective: workout.sessionObjective,
      startAt: "",
      endAt: "",
      kind: workout.sessionKind,
      status: "planned",
      location: "",
      coachNote: workout.coachNote,
      sessionNote: workout.sessionNote,
      exercises: workout.exercises,
    },
    actor,
    {
      sourcePlanId: getActiveWorkoutPlan(previous, clientId)?.id,
      activityType: "session.planned",
      activityDetail: `AI prepared the next workout for ${client.fullName}.`,
      skipScheduleValidation: true,
    },
  );
}

function buildCompletedSessionState(previous: CRMState, sessionId: string, actor: string) {
  const existingSession = previous.sessions.find((session) => session.id === sessionId);
  const nextState = updateWorkout(previous, sessionId, (workout) => ({
    ...workout,
    status: "completed",
  }));

  return reconcileBillingState({
    ...nextState,
    sessions: nextState.sessions.map((session) =>
      session.id === sessionId
        ? { ...session, status: "completed" as const }
        : session,
    ),
    activityEvents: [
      {
        id: `act-${crypto.randomUUID()}`,
        actor,
        clientId: existingSession?.primaryClientId,
        type: "session.completed",
        detail: `Marked ${existingSession?.title ?? "session"} as completed.`,
        createdAt: timestamp(),
      },
      ...nextState.activityEvents,
    ],
  });
}

function formatAuthError(locale: Locale, error: unknown) {
  const message = error instanceof Error ? error.message : translate(locale, "auth.requestFailed");

  if (message.includes("auth/invalid-credential")) {
    return translate(locale, "auth.invalidCredentials");
  }

  if (message.includes("auth/email-already-in-use")) {
    return translate(locale, "auth.emailInUse");
  }

  if (message.includes("auth/weak-password")) {
    return translate(locale, "auth.passwordHint");
  }

  if (message.includes("auth/popup-closed-by-user")) {
    return translate(locale, "auth.popupClosed");
  }

  if (message.includes("auth/cancelled-popup-request")) {
    return translate(locale, "auth.popupClosed");
  }

  return message;
}

function describeNutritionRefreshTrigger(
  trigger: "assessment-update" | "assessment-backfill",
  clientName: string,
) {
  if (trigger === "assessment-update") {
    return `Refreshed AI nutrition guidance for ${clientName} after a body assessment update.`;
  }

  return `Generated AI nutrition guidance for ${clientName} from the latest body assessment.`;
}

function isStorageMissingError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "storage/object-not-found"
  ) {
    return true;
  }

  return error instanceof Error && error.message.includes("storage/object-not-found");
}

async function deleteStorageFolderRecursive(reference: StorageReference): Promise<void> {
  try {
    const result = await listAll(reference);
    await Promise.all(result.prefixes.map((child) => deleteStorageFolderRecursive(child)));
    await Promise.all(result.items.map((item) => deleteObject(item)));
  } catch (error) {
    if (isStorageMissingError(error)) {
      return;
    }

    throw error;
  }
}

function removeClientFromState(previous: CRMState, clientId: string): CRMState {
  const client = previous.clients.find((item) => item.id === clientId);
  if (!client) {
    return previous;
  }

  const clientEmail = client.email.toLowerCase();
  const relatedLeadNames = new Set(
    previous.leads
      .filter(
        (lead) =>
          lead.id === client.originLeadId || lead.email.toLowerCase() === clientEmail,
      )
      .map((lead) => lead.fullName.trim().toLowerCase())
      .filter(Boolean),
  );
  relatedLeadNames.add(client.fullName.trim().toLowerCase());

  const deletedPackagePurchaseIds = new Set(
    previous.packagePurchases
      .filter((purchase) => purchase.clientId === clientId)
      .map((purchase) => purchase.id),
  );
  const deletedInvoiceIds = new Set(
    previous.invoiceRecords
      .filter(
        (invoice) =>
          invoice.clientId === clientId ||
          (invoice.packagePurchaseId
            ? deletedPackagePurchaseIds.has(invoice.packagePurchaseId)
            : false),
      )
      .map((invoice) => invoice.id),
  );
  const deletedThreadIds = new Set(
    previous.emailThreads
      .filter((thread) => thread.clientId === clientId)
      .map((thread) => thread.id),
  );
  const deletedSessionIds = new Set<string>();

  const nextSessions = previous.sessions.flatMap((session) => {
    if (!session.clientIds.includes(clientId) && session.primaryClientId !== clientId) {
      return [session];
    }

    const remainingClientIds = session.clientIds.filter((id) => id !== clientId);
    if (remainingClientIds.length === 0) {
      deletedSessionIds.add(session.id);
      return [];
    }

    return [
      {
        ...session,
        clientIds: remainingClientIds,
        primaryClientId:
          session.primaryClientId === clientId
            ? remainingClientIds[0]
            : session.primaryClientId,
        packagePurchaseId:
          session.packagePurchaseId &&
          deletedPackagePurchaseIds.has(session.packagePurchaseId)
            ? undefined
            : session.packagePurchaseId,
      },
    ];
  });

  const deletedPlannedWorkoutIds = new Set(
    previous.plannedWorkouts
      .filter(
        (workout) =>
          workout.clientId === clientId || deletedSessionIds.has(workout.sessionId),
      )
      .map((workout) => workout.id),
  );

  return {
    ...previous,
    leads: previous.leads.filter(
      (lead) =>
        lead.id !== client.originLeadId &&
        lead.email.toLowerCase() !== clientEmail,
    ),
    clients: previous.clients.filter((item) => item.id !== clientId),
    packagePurchases: previous.packagePurchases.flatMap((purchase) => {
      if (purchase.clientId === clientId) {
        return [];
      }

      if (!(purchase.sharedClientIds ?? []).includes(clientId)) {
        return [purchase];
      }

      const remainingSharedClientIds = (purchase.sharedClientIds ?? []).filter(
        (sharedClientId) => sharedClientId !== clientId,
      );

      return [
        {
          ...purchase,
          sharedClientIds:
            remainingSharedClientIds.length > 0 ? remainingSharedClientIds : undefined,
        },
      ];
    }),
    sessions: nextSessions.map((session) => ({
      ...session,
      plannedWorkoutId:
        session.plannedWorkoutId && deletedPlannedWorkoutIds.has(session.plannedWorkoutId)
          ? undefined
          : session.plannedWorkoutId,
    })),
    plannedWorkouts: previous.plannedWorkouts.filter(
      (workout) =>
        workout.clientId !== clientId && !deletedSessionIds.has(workout.sessionId),
    ),
    sessionWorkouts: previous.sessionWorkouts.filter(
      (workout) => !deletedSessionIds.has(workout.sessionId),
    ),
    bodyAssessments: previous.bodyAssessments.filter(
      (assessment) => assessment.clientId !== clientId,
    ),
    workoutPlans: previous.workoutPlans.filter((plan) => plan.clientId !== clientId),
    nutritionPlans: previous.nutritionPlans.filter((plan) => plan.clientId !== clientId),
    emailThreads: previous.emailThreads.filter((thread) => thread.clientId !== clientId),
    emailMessages: previous.emailMessages.filter(
      (message) =>
        message.clientId !== clientId && !deletedThreadIds.has(message.threadId),
    ),
    reminders: previous.reminders.filter(
      (reminder) =>
        reminder.clientId !== clientId &&
        (!reminder.sessionId || !deletedSessionIds.has(reminder.sessionId)),
    ),
    invoiceRecords: previous.invoiceRecords.filter(
      (invoice) =>
        invoice.clientId !== clientId &&
        (!invoice.packagePurchaseId ||
          !deletedPackagePurchaseIds.has(invoice.packagePurchaseId)),
    ),
    paymentRecords: previous.paymentRecords.filter(
      (payment) =>
        payment.clientId !== clientId && !deletedInvoiceIds.has(payment.invoiceId),
    ),
    activityEvents: previous.activityEvents.filter((event) => {
      if (event.clientId === clientId) {
        return false;
      }

      if (event.type !== "lead.created") {
        return true;
      }

      const detail = event.detail.toLowerCase();
      return !Array.from(relatedLeadNames).some((name) => detail.includes(name));
    }),
    aiDrafts: previous.aiDrafts.filter(
      (draft) =>
        draft.clientId !== clientId &&
        (!draft.sessionId || !deletedSessionIds.has(draft.sessionId)),
    ),
  };
}

function removeLeadFromState(previous: CRMState, leadId: string): CRMState {
  const lead = previous.leads.find((item) => item.id === leadId);
  if (!lead) {
    return previous;
  }

  const leadName = lead.fullName.trim().toLowerCase();

  return {
    ...previous,
    leads: previous.leads.filter((item) => item.id !== leadId),
    activityEvents: previous.activityEvents.filter((event) => {
      if (event.type !== "lead.created") {
        return true;
      }

      return !event.detail.toLowerCase().includes(leadName);
    }),
  };
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const firebaseConfigured = isFirebaseConfigured();
  const [locale, setLocaleState] = useState<Locale>("en");
  const [authUser, setAuthUser] = useState<FirebaseAuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(firebaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [state, setState] = useState<CRMState>(() => loadInitialState(firebaseConfigured));
  const [crmLoading, setCrmLoading] = useState(firebaseConfigured);
  const [crmHydrated, setCrmHydrated] = useState(!firebaseConfigured);
  const [crmError, setCrmError] = useState<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(state);
  const nutritionRefreshInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (storedLocale === "et" || storedLocale === "en") {
      setLocaleState(storedLocale);
      document.documentElement.lang = storedLocale;
      return;
    }

    localStorage.setItem(LOCALE_STORAGE_KEY, "en");
    document.documentElement.lang = "en";
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (firebaseConfigured) {
      return;
    }

    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  }, [firebaseConfigured, state]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    const services = getFirebaseServices();
    if (!services) {
      return;
    }

    let active = true;
    let unsubscribeState: (() => void) | null = null;
    let unsubscribeAuth: (() => void) | null = null;

    void services.persistenceReady.finally(() => {
      if (!active) {
        return;
      }

      unsubscribeAuth = onAuthStateChanged(services.auth, (nextUser) => {
        if (nextUser && !isAllowedEmail(nextUser.email)) {
          setAuthError(translate(locale, "auth.restrictedAccess"));
          setAuthUser(null);
          setState(cloneInitialState());
          setCrmHydrated(false);
          setCrmError(null);
          setCrmLoading(false);
          setAuthLoading(false);
          void signOut(services.auth).catch(() => undefined);
          return;
        }

        setAuthUser(nextUser);
        setAuthLoading(false);
        setAuthError(null);
        unsubscribeState?.();
        unsubscribeState = null;

        if (!nextUser) {
          setState(cloneInitialState());
          setCrmHydrated(false);
          setCrmError(null);
          setCrmLoading(false);
          return;
        }

        setCrmHydrated(false);
        setCrmLoading(true);
        unsubscribeState = subscribeToCRMState(
          services.db,
          (nextState) => {
            setState(normalizeCRMState(nextState));
            setCrmHydrated(true);
            setCrmLoading(false);
            setCrmError(null);
          },
          (error) => {
            setCrmHydrated(false);
            setCrmLoading(false);
            setCrmError(error.message);
          },
        );
      });
    });

    return () => {
      active = false;
      unsubscribeAuth?.();
      unsubscribeState?.();
    };
  }, [firebaseConfigured, locale]);

  function applyCRMUpdate(updater: (previous: CRMState) => CRMState) {
    setState((previous) => {
      const next = updater(previous);
      if (next === previous) {
        return previous;
      }

      if (firebaseConfigured && authUser) {
        const services = getFirebaseServices();
        if (services) {
          saveQueueRef.current = saveQueueRef.current
            .then(() => saveCRMState(services.db, next, previous))
            .catch((error) => {
              setCrmError(
                error instanceof Error
                  ? error.message
                  : "Could not sync CRM state to Firebase.",
              );
            });
        }
      }

      return next;
    });
  }

  const localeValue = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: (nextLocale) => startTransition(() => setLocaleState(nextLocale)),
      t: (key) => translate(locale, key),
      formatDate: (value, options) => {
        if (!value) {
          return translate(locale, "common.noDateYet");
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return translate(locale, "common.noDateYet");
        }

        return new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          ...options,
        }).format(parsed);
      },
      formatCurrency: (value) =>
        new Intl.NumberFormat(locale === "et" ? "et-EE" : "en-GB", {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0,
        }).format(value),
    }),
    [locale],
  );

  const authValue: AuthContextValue = {
    user: authUser,
    loading: authLoading || crmLoading,
    error: authError,
    firebaseConfigured,
    liveData: firebaseConfigured && Boolean(authUser),
    signIn: async (email, password) => {
      const services = getFirebaseServices();
      if (!services) {
        return;
      }
      const normalizedEmail = normalizeEmail(email);

      setAuthError(null);
      setAuthLoading(true);

      if (!isAllowedEmail(normalizedEmail)) {
        setAuthLoading(false);
        setAuthError(translate(locale, "auth.restrictedAccess"));
        return;
      }

      try {
        await signInWithEmailAndPassword(services.auth, normalizedEmail, password);
      } catch (error) {
        setAuthLoading(false);
        setAuthError(formatAuthError(locale, error));
      }
    },
    signInWithGoogle: async () => {
      const services = getFirebaseServices();
      if (!services) {
        return;
      }

      setAuthError(null);
      setAuthLoading(true);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      try {
        const result = await signInWithPopup(services.auth, provider);
        if (!isAllowedEmail(result.user.email)) {
          await signOut(services.auth);
          setAuthLoading(false);
          setAuthError(translate(locale, "auth.restrictedAccess"));
        }
      } catch (error) {
        setAuthLoading(false);
        setAuthError(formatAuthError(locale, error));
      }
    },
    signUp: async (email, password) => {
      const services = getFirebaseServices();
      if (!services) {
        return;
      }
      const normalizedEmail = normalizeEmail(email);

      setAuthError(null);
      setAuthLoading(true);

      if (!isAllowedEmail(normalizedEmail)) {
        setAuthLoading(false);
        setAuthError(translate(locale, "auth.restrictedAccess"));
        return;
      }

      try {
        await createUserWithEmailAndPassword(services.auth, normalizedEmail, password);
      } catch (error) {
        setAuthLoading(false);
        setAuthError(formatAuthError(locale, error));
      }
    },
    signOutUser: async () => {
      const services = getFirebaseServices();
      if (!services) {
        return;
      }

      setAuthLoading(true);

      try {
        await signOut(services.auth);
      } catch (error) {
        setAuthLoading(false);
        setAuthError(formatAuthError(locale, error));
      }
    },
  };

  async function refreshNutritionPlan({
    clientId,
    clientOverride,
    assessmentsOverride,
    trigger = "assessment-update",
  }: {
    clientId: string;
    clientOverride?: ClientProfile;
    assessmentsOverride?: BodyAssessment[];
    trigger?: "assessment-update" | "assessment-backfill";
  }) {
    const snapshot = stateRef.current;
    const client =
      clientOverride ?? snapshot.clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const recentAssessments =
      assessmentsOverride ?? getClientAssessments(snapshot, clientId);
    if (recentAssessments.length === 0) {
      return;
    }

    if (nutritionRefreshInFlightRef.current.has(clientId)) {
      return;
    }

    const recentSessions = getClientSessions(snapshot, clientId);
    const currentNutritionPlan =
      getClientNutritionPlans(snapshot, clientId).find((plan) => plan.status === "active") ??
      null;

    nutritionRefreshInFlightRef.current.add(clientId);

    try {
      const response = await fetch("/api/ai/nutrition-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: client.preferredLanguage,
          client,
          currentNutritionPlan,
          recentAssessments,
          recentSessions,
        }),
      });

      if (!response.ok) {
        throw new Error("Nutrition plan generation failed.");
      }

      const payload = (await response.json()) as {
        plan: Omit<
          NutritionPlan,
          "id" | "clientId" | "status" | "createdAt" | "updatedAt" | "origin"
        >;
      };

      applyCRMUpdate((previous) => {
        const now = timestamp();
        const existingActivePlan = previous.nutritionPlans.find(
          (plan) => plan.clientId === clientId && plan.status === "active",
        );
        const nextPlan: NutritionPlan = {
          id: existingActivePlan?.id ?? `np-${crypto.randomUUID()}`,
          clientId,
          title: payload.plan.title,
          status: "active",
          calories: payload.plan.calories,
          proteinGrams: payload.plan.proteinGrams,
          carbsGrams: payload.plan.carbsGrams,
          fatsGrams: payload.plan.fatsGrams,
          hydrationLiters: payload.plan.hydrationLiters,
          principles: payload.plan.principles,
          breakfastSharePercent: payload.plan.breakfastSharePercent,
          lunchSharePercent: payload.plan.lunchSharePercent,
          dinnerSharePercent: payload.plan.dinnerSharePercent,
          coachRecommendation: payload.plan.coachRecommendation,
          createdAt: existingActivePlan?.createdAt ?? now,
          updatedAt: now,
          origin: "ai",
        };

        return {
          ...previous,
          nutritionPlans: [
            nextPlan,
            ...previous.nutritionPlans
              .filter((plan) => plan.id !== nextPlan.id)
              .map((plan) =>
                plan.clientId === clientId && plan.status === "active"
                  ? { ...plan, status: "archived" as const }
                  : plan,
              ),
          ],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: "AI",
              clientId,
              type: "nutrition.updated",
              detail: describeNutritionRefreshTrigger(trigger, client.fullName),
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nutrition plan generation failed.";
      setCrmError(message);
      throw error;
    } finally {
      nutritionRefreshInFlightRef.current.delete(clientId);
    }
  }

  async function generateInitialWorkout({
    clientId,
    clientOverride,
  }: {
    clientId: string;
    clientOverride?: ClientProfile;
  }) {
    const snapshot = stateRef.current;
    const client =
      clientOverride ?? snapshot.clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const replaceableStarter = getReplaceableStarterTraining(snapshot, clientId);
    if (clientHasTraining(snapshot, clientId) && !replaceableStarter) {
      return;
    }

    const persistInitialWorkout = (workout: StarterWorkoutDraft) => {
      applyCRMUpdate((previous) => {
        const currentClient = previous.clients.find((item) => item.id === clientId);
        if (!currentClient) {
          return previous;
        }
        return applyStarterWorkoutState(previous, currentClient, workout, {
          replaceExistingStarter: true,
        });
      });
    };

    try {
      const response = await fetch("/api/ai/first-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: client.preferredLanguage,
          client,
          recentAssessments: getClientAssessments(snapshot, clientId),
          recentSessions: getClientSessions(snapshot, clientId),
          trainingLocations: snapshot.trainingLocations,
        }),
      });

      if (!response.ok) {
        throw new Error("Initial workout generation failed.");
      }

      const payload = (await response.json()) as {
        workout: {
          planTitle: string;
          planGoal: string;
          focusAreas: string[];
          sessionPattern: string[];
          sessionTitle: string;
          sessionObjective: string;
          sessionKind: CreateWorkoutSessionInput["kind"];
          coachNote: string;
          sessionNote: string;
          exercises: CreateWorkoutSessionInput["exercises"];
        };
      };

      persistInitialWorkout(payload.workout);
    } catch (error) {
      console.error("Initial workout generation failed.", error);
      persistInitialWorkout(buildLocalStarterWorkout(client));
    }
  }

  async function regenerateSessionWorkout({
    sessionId,
    instructions,
  }: {
    sessionId: string;
    instructions: string;
  }) {
    const snapshot = stateRef.current;
    const bundle = getSessionBundle(snapshot, sessionId);
    const normalizedInstructions = instructions.trim();

    if (!bundle?.client || !bundle.sessionWorkout || !normalizedInstructions) {
      return;
    }

    try {
      const response = await fetch("/api/ai/rework-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: bundle.client.preferredLanguage,
          client: bundle.client,
          session: bundle.session,
          plannedWorkout: bundle.plannedWorkout,
          sessionWorkout: bundle.sessionWorkout,
          recentAssessments: getClientAssessments(snapshot, bundle.client.id),
          recentCompletedWorkouts: getRecentCompletedSessionBundles(
            snapshot,
            bundle.client.id,
            7,
          ),
          instructions: normalizedInstructions,
        }),
      });

      if (!response.ok) {
        throw new Error("Session workout regeneration failed.");
      }

      const payload = (await response.json()) as {
        workout: GeneratedSessionDraft;
      };

      applyCRMUpdate((previous) =>
        replaceSessionWorkoutState(previous, sessionId, payload.workout, "AI", {
          activityType: "session.updated",
          activityDetail: `AI rebuilt ${bundle.session.title} from the coach instruction.`,
        }),
      );
      setCrmError(null);
    } catch (error) {
      console.error("Session workout regeneration failed.", error);
      setCrmError(
        error instanceof Error
          ? error.message
          : "The workout could not be rebuilt right now.",
      );
    }
  }

  async function generateNextWorkoutForClient(
    clientId: string,
    baseSnapshot?: CRMState,
  ) {
    const snapshot = baseSnapshot ?? stateRef.current;
    const client = snapshot.clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const recentCompletedWorkouts = getRecentCompletedSessionBundles(snapshot, clientId, 7);
    if (recentCompletedWorkouts.length === 0) {
      return;
    }

    try {
      const response = await fetch("/api/ai/next-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: client.preferredLanguage,
          client,
          currentWorkoutPlan: getActiveWorkoutPlan(snapshot, clientId) ?? null,
          recentAssessments: getClientAssessments(snapshot, clientId),
          recentCompletedWorkouts,
        }),
      });

      if (!response.ok) {
        throw new Error("Next workout generation failed.");
      }

      const payload = (await response.json()) as {
        workout: GeneratedSessionDraft;
      };

      applyCRMUpdate((previous) =>
        upsertGeneratedNextSession(previous, clientId, payload.workout, "AI"),
      );
      setCrmError(null);
    } catch (error) {
      console.error("Next workout generation failed.", error);
      setCrmError(
        error instanceof Error
          ? error.message
          : "The next workout could not be generated right now.",
      );
    }
  }

  async function generateWorkoutSummaryForSession(
    sessionId: string,
    baseSnapshot?: CRMState,
  ) {
    const snapshot = baseSnapshot ?? stateRef.current;
    const bundle = getSessionBundle(snapshot, sessionId);
    if (!bundle?.client || !bundle.sessionWorkout) {
      return;
    }

    try {
      const response = await fetch("/api/ai/workout-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: bundle.client.preferredLanguage,
          client: bundle.client,
          session: bundle.session,
          plannedWorkout: bundle.plannedWorkout,
          sessionWorkout: bundle.sessionWorkout,
          assessments: getClientAssessments(snapshot, bundle.client.id),
        }),
      });

      if (!response.ok) {
        throw new Error("Workout summary generation failed.");
      }

      const payload = (await response.json()) as { draft: AIDraft };
      applyCRMUpdate((previous) => {
        const staleDraftIds = new Set(
          previous.aiDrafts
            .filter(
              (draft) =>
                draft.sessionId === sessionId && draft.type === "workout-summary",
            )
            .map((draft) => draft.id),
        );

        return {
          ...previous,
          aiDrafts: [
            payload.draft,
            ...previous.aiDrafts.filter((draft) => !staleDraftIds.has(draft.id)),
          ],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: "AI",
              clientId: payload.draft.clientId,
              type: "ai.draft",
              detail: "Generated workout-summary draft.",
              createdAt: timestamp(),
            },
            ...previous.activityEvents,
          ],
        };
      });
      setCrmError(null);
    } catch (error) {
      console.error("Workout summary generation failed.", error);
      setCrmError(
        error instanceof Error
          ? error.message
          : "The workout summary could not be generated right now.",
      );
    }
  }

  async function completeSessionAndGenerateNext(sessionId: string) {
    const snapshot = stateRef.current;
    const session = snapshot.sessions.find((item) => item.id === sessionId);
    if (!session || session.status === "completed") {
      return;
    }

    const actor = snapshot.users[0]?.name ?? authUser?.email ?? "Coach";
    const completedSnapshot = buildCompletedSessionState(snapshot, sessionId, actor);
    applyCRMUpdate((previous) => buildCompletedSessionState(previous, sessionId, actor));

    const tasks: Promise<void>[] = [generateWorkoutSummaryForSession(sessionId, completedSnapshot)];
    if (session.primaryClientId) {
      tasks.push(generateNextWorkoutForClient(session.primaryClientId, completedSnapshot));
    }

    await Promise.allSettled(tasks);
  }

  const crmValue: CRMContextValue = {
    state,
    loading: authLoading || crmLoading,
    hydrated: crmHydrated,
    error: crmError,
    persistenceMode: firebaseConfigured ? "firebase" : "local",
    createLead: (input) =>
      applyCRMUpdate((previous) => {
        if (
          previous.leads.some((lead) => lead.email.toLowerCase() === input.email.toLowerCase()) ||
          previous.clients.some((client) => client.email.toLowerCase() === input.email.toLowerCase())
        ) {
          return previous;
        }

        const now = timestamp();
        const lead = {
          id: `lead-${crypto.randomUUID()}`,
          ...input,
          createdAt: now,
          lastContactAt: now,
        };

        return {
          ...previous,
          leads: [lead, ...previous.leads],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              type: "lead.created",
              detail: `Added ${lead.fullName} to the lead pipeline.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      }),
    createClient: (input) => {
      const snapshot = stateRef.current;
      if (
        snapshot.clients.some(
          (client) => client.email.toLowerCase() === input.email.toLowerCase(),
        )
      ) {
        return;
      }

      const client: ClientProfile = {
        id: `client-${crypto.randomUUID()}`,
        ...input,
        joinedAt: timestamp(),
        ownerId: snapshot.users[0]?.id ?? "user-maria",
        avatarHue: randomHue(),
      };
      const starterWorkout = buildLocalStarterWorkout(client);

      applyCRMUpdate((previous) => {
        if (
          previous.clients.some(
            (existingClient) =>
              existingClient.email.toLowerCase() === input.email.toLowerCase(),
          )
        ) {
          return previous;
        }

        const withClient: CRMState = {
          ...previous,
          clients: [client, ...previous.clients],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: client.id,
              type: "client.created",
              detail: `Created client profile for ${client.fullName}.`,
              createdAt: timestamp(),
            },
            ...previous.activityEvents,
          ],
        };

        return applyStarterWorkoutState(withClient, client, starterWorkout);
      });

      void generateInitialWorkout({
        clientId: client.id,
        clientOverride: client,
      });
    },
    createClientFromLead: (leadId, input) => {
      const snapshot = stateRef.current;
      const lead = snapshot.leads.find((item) => item.id === leadId);
      if (!lead) {
        return;
      }

      if (
        snapshot.clients.some(
          (client) =>
            client.email.toLowerCase() === input.email.toLowerCase() &&
            client.email.toLowerCase() !== lead.email.toLowerCase(),
        )
      ) {
        return;
      }

      const client: ClientProfile = {
        id: `client-${crypto.randomUUID()}`,
        originLeadId: leadId,
        ...input,
        joinedAt: timestamp(),
        ownerId: snapshot.users[0]?.id ?? "user-maria",
        avatarHue: randomHue(),
      };
      const starterWorkout = buildLocalStarterWorkout(client);

      applyCRMUpdate((previous) => {
        const currentLead = previous.leads.find((item) => item.id === leadId);
        if (!currentLead) {
          return previous;
        }

        if (
          previous.clients.some(
            (existingClient) =>
              existingClient.email.toLowerCase() === input.email.toLowerCase() &&
              existingClient.email.toLowerCase() !== currentLead.email.toLowerCase(),
          )
        ) {
          return previous;
        }

        const now = timestamp();
        const withClient: CRMState = {
          ...previous,
          leads: previous.leads.map((item) =>
            item.id === leadId
              ? {
                  ...item,
                  status: "converted",
                  fullName: input.fullName,
                  email: input.email,
                  phone: input.phone,
                  preferredLanguage: input.preferredLanguage,
                  goal: input.goals.join(", "),
                  notes: input.notes,
                  lastContactAt: now,
                }
              : item,
          ),
          clients: [client, ...previous.clients],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: client.id,
              type: "lead.converted",
              detail: `Converted ${currentLead.fullName} into an active client profile.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };

        return applyStarterWorkoutState(withClient, client, starterWorkout);
      });

      void generateInitialWorkout({
        clientId: client.id,
        clientOverride: client,
      });
    },
    updateClient: (clientId, input) => {
      const snapshot = stateRef.current;
      const existingClient = snapshot.clients.find((client) => client.id === clientId);
      if (!existingClient) {
        return;
      }

      applyCRMUpdate((previous) => {
        const currentClient = previous.clients.find((client) => client.id === clientId);
        if (!currentClient) {
          return previous;
        }

        const now = timestamp();
        const relatedLead = previous.leads.find(
          (lead) =>
            lead.id === currentClient.originLeadId ||
            (!currentClient.originLeadId &&
              lead.status === "converted" &&
              lead.email.toLowerCase() === currentClient.email.toLowerCase()),
        );

        return {
          ...previous,
          clients: previous.clients.map((client) =>
            client.id === clientId
              ? {
                  ...client,
                  ...input,
                }
              : client,
          ),
          leads: relatedLead
            ? previous.leads.map((lead) =>
                lead.id === relatedLead.id
                  ? {
                      ...lead,
                      fullName: input.fullName,
                      email: input.email,
                      phone: input.phone,
                      preferredLanguage: input.preferredLanguage,
                      goal: input.goals.join(", "),
                      notes: input.notes,
                      status: "converted",
                      lastContactAt: now,
                    }
                  : lead,
              )
            : previous.leads,
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId,
              type: "client.updated",
              detail: `Updated client profile for ${input.fullName}.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      });

    },
    deleteLead: async (leadId) => {
      const previous = stateRef.current;
      if (!previous.leads.some((item) => item.id === leadId)) {
        return;
      }

      const next = removeLeadFromState(previous, leadId);
      if (next === previous) {
        return;
      }

      setCrmError(null);
      stateRef.current = next;
      setState(next);

      if (firebaseConfigured && authUser) {
        const services = getFirebaseServices();
        if (services) {
          try {
            const persistPromise = saveQueueRef.current.then(() =>
              saveCRMState(services.db, next, previous),
            );
            saveQueueRef.current = persistPromise.catch((error) => {
              setCrmError(
                error instanceof Error
                  ? error.message
                  : "Could not sync CRM state to Firebase.",
              );
            });
            await persistPromise;
          } catch (error) {
            stateRef.current = previous;
            setState(previous);
            const message =
              error instanceof Error ? error.message : "Lead deletion failed.";
            setCrmError(message);
            throw error;
          }
        }
      }
    },
    deleteClient: async (clientId) => {
      const previous = stateRef.current;
      if (!previous.clients.some((item) => item.id === clientId)) {
        return;
      }

      const next = removeClientFromState(previous, clientId);
      if (next === previous) {
        return;
      }

      setCrmError(null);
      stateRef.current = next;
      setState(next);

      if (firebaseConfigured && authUser) {
        const services = getFirebaseServices();
        if (services) {
          try {
            const persistPromise = saveQueueRef.current.then(() =>
              saveCRMState(services.db, next, previous),
            );
            saveQueueRef.current = persistPromise.catch((error) => {
              setCrmError(
                error instanceof Error
                  ? error.message
                  : "Could not sync CRM state to Firebase.",
              );
            });
            await persistPromise;
          } catch (error) {
            stateRef.current = previous;
            setState(previous);
            const message =
              error instanceof Error ? error.message : "Client deletion failed.";
            setCrmError(message);
            throw error;
          }

          try {
            await deleteStorageFolderRecursive(
              storageRef(
                services.storage,
                `workspaces/${FIREBASE_WORKSPACE_ID}/clients/${clientId}`,
              ),
            );
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Client data was deleted, but storage cleanup failed.";
            setCrmError(message);
            throw error;
          }
        }
      }
    },
    createPackageTemplate: (input) => {
      const snapshot = stateRef.current;
      const normalizedName = normalizeCatalogName(input.name);
      const sessionCount = Math.max(1, Math.round(input.sessionCount));
      const maxParticipants = Math.max(1, Math.round(input.maxParticipants));
      const durationMinutes = Math.max(15, Math.round(input.durationMinutes));
      const price = clampAmount(input.price, Number.MAX_SAFE_INTEGER);

      if (
        !normalizedName ||
        !Number.isFinite(sessionCount) ||
        !Number.isFinite(maxParticipants) ||
        !Number.isFinite(durationMinutes) ||
        price <= 0
      ) {
        return { ok: false, reason: "invalid" };
      }

      if (
        snapshot.packageTemplates.some(
          (template) => template.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      ) {
        return { ok: false, reason: "duplicate" };
      }

      const nextTemplate = {
        id: `pt-${crypto.randomUUID()}`,
        name: normalizedName,
        sessionCount,
        tier: input.tier,
        maxParticipants,
        durationMinutes,
        price,
        currency: "EUR" as const,
      };
      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        packageTemplates: sortPackageTemplates([...previous.packageTemplates, nextTemplate]),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "package-template.created",
            detail: `Added ${nextTemplate.name} to the package catalog.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    updatePackageTemplate: (templateId, input) => {
      const snapshot = stateRef.current;
      const existingTemplate = snapshot.packageTemplates.find((template) => template.id === templateId);
      if (!existingTemplate) {
        return { ok: false, reason: "not-found" };
      }

      const normalizedName = normalizeCatalogName(input.name);
      const sessionCount = Math.max(1, Math.round(input.sessionCount));
      const maxParticipants = Math.max(1, Math.round(input.maxParticipants));
      const durationMinutes = Math.max(15, Math.round(input.durationMinutes));
      const price = clampAmount(input.price, Number.MAX_SAFE_INTEGER);

      if (
        !normalizedName ||
        !Number.isFinite(sessionCount) ||
        !Number.isFinite(maxParticipants) ||
        !Number.isFinite(durationMinutes) ||
        price <= 0
      ) {
        return { ok: false, reason: "invalid" };
      }

      if (
        snapshot.packageTemplates.some(
          (template) =>
            template.id !== templateId &&
            template.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      ) {
        return { ok: false, reason: "duplicate" };
      }

      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        packageTemplates: sortPackageTemplates(
          previous.packageTemplates.map((template) =>
            template.id === templateId
              ? {
                  ...template,
                  name: normalizedName,
                  sessionCount,
                  tier: input.tier,
                  maxParticipants,
                  durationMinutes,
                  price,
                }
              : template,
          ),
        ),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "package-template.updated",
            detail: `Updated ${existingTemplate.name} in the package catalog.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    deletePackageTemplate: (templateId) => {
      const snapshot = stateRef.current;
      const existingTemplate = snapshot.packageTemplates.find((template) => template.id === templateId);
      if (!existingTemplate) {
        return { ok: false, reason: "not-found" };
      }

      if (snapshot.packagePurchases.some((purchase) => purchase.templateId === templateId)) {
        return { ok: false, reason: "in-use" };
      }

      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        packageTemplates: previous.packageTemplates.filter((template) => template.id !== templateId),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "package-template.deleted",
            detail: `Removed ${existingTemplate.name} from the package catalog.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    createTrainingLocation: (input) => {
      const snapshot = stateRef.current;
      const normalizedName = normalizeCatalogName(input.name);

      if (!normalizedName) {
        return { ok: false, reason: "invalid" };
      }

      if (
        snapshot.trainingLocations.some(
          (location) => location.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      ) {
        return { ok: false, reason: "duplicate" };
      }

      const nextLocation = {
        id: `location-${crypto.randomUUID()}`,
        name: normalizedName,
      };
      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        trainingLocations: sortTrainingLocations([...previous.trainingLocations, nextLocation]),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "location.created",
            detail: `Added ${nextLocation.name} to the location catalog.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    updateTrainingLocation: (locationId, input) => {
      const snapshot = stateRef.current;
      const existingLocation = snapshot.trainingLocations.find((location) => location.id === locationId);
      if (!existingLocation) {
        return { ok: false, reason: "not-found" };
      }

      const normalizedName = normalizeCatalogName(input.name);
      if (!normalizedName) {
        return { ok: false, reason: "invalid" };
      }

      if (
        snapshot.trainingLocations.some(
          (location) =>
            location.id !== locationId &&
            location.name.toLowerCase() === normalizedName.toLowerCase(),
        )
      ) {
        return { ok: false, reason: "duplicate" };
      }

      const previousName = existingLocation.name;
      const previousKey = previousName.toLowerCase();
      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        trainingLocations: sortTrainingLocations(
          previous.trainingLocations.map((location) =>
            location.id === locationId ? { ...location, name: normalizedName } : location,
          ),
        ),
        sessions: previous.sessions.map((session) =>
          session.location.trim().toLowerCase() === previousKey
            ? { ...session, location: normalizedName }
            : session,
        ),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "location.updated",
            detail: `Updated training location ${previousName}.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    deleteTrainingLocation: (locationId) => {
      const snapshot = stateRef.current;
      const existingLocation = snapshot.trainingLocations.find((location) => location.id === locationId);
      if (!existingLocation) {
        return { ok: false, reason: "not-found" };
      }

      if (
        snapshot.sessions.some(
          (session) =>
            normalizeCatalogName(session.location).toLowerCase() ===
            existingLocation.name.toLowerCase(),
        )
      ) {
        return { ok: false, reason: "in-use" };
      }

      const now = timestamp();

      applyCRMUpdate((previous) => ({
        ...previous,
        trainingLocations: previous.trainingLocations.filter(
          (location) => location.id !== locationId,
        ),
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            type: "location.deleted",
            detail: `Removed ${existingLocation.name} from the location catalog.`,
            createdAt: now,
          },
          ...previous.activityEvents,
        ],
      }));

      return { ok: true };
    },
    addPackagePurchase: (input) =>
      applyCRMUpdate((previous) => {
        const template = previous.packageTemplates.find((item) => item.id === input.templateId);
        if (!template) {
          return previous;
        }

        const sharedClientIds =
          template.tier === "duo"
            ? [...new Set(input.sharedClientIds ?? [])]
                .filter(
                  (sharedClientId) =>
                    sharedClientId !== input.clientId &&
                    previous.clients.some((client) => client.id === sharedClientId),
                )
                .slice(0, Math.max(template.maxParticipants - 1, 0))
            : [];

        const invoiceId = `inv-${crypto.randomUUID()}`;
        const purchaseId = `pkg-${crypto.randomUUID()}`;
        const paidAmount =
          input.paymentStatus === "paid"
            ? template.price
            : clampAmount(input.amountPaid, template.price);
        const paymentStatus =
          paidAmount >= template.price
            ? "paid"
            : paidAmount > 0
              ? input.paymentStatus === "overdue"
                ? "overdue"
                : "partial"
              : input.paymentStatus;
        const now = timestamp();

        return reconcileBillingState({
          ...previous,
          packagePurchases: [
            {
              id: purchaseId,
              clientId: input.clientId,
              sharedClientIds: sharedClientIds.length > 0 ? sharedClientIds : undefined,
              templateId: input.templateId,
              purchasedAt: input.purchasedAt,
              startsAt: input.startsAt,
              expiresAt: input.expiresAt,
              totalUnits: template.sessionCount,
              usedUnits: 0,
              price: template.price,
              paymentStatus,
              invoiceId,
              notes: input.notes?.trim() ? input.notes.trim() : undefined,
            },
            ...previous.packagePurchases,
          ],
          invoiceRecords: [
            {
              id: invoiceId,
              clientId: input.clientId,
              packagePurchaseId: purchaseId,
              issuedAt: input.purchasedAt,
              dueAt: addDays(input.purchasedAt, 3),
              amount: template.price,
              currency: template.currency,
              paymentStatus,
            },
            ...previous.invoiceRecords,
          ],
          paymentRecords:
            paidAmount > 0
              ? [
                  {
                    id: `pay-${crypto.randomUUID()}`,
                    clientId: input.clientId,
                    invoiceId,
                    paidAt: input.purchasedAt,
                    amount: paidAmount,
                    currency: template.currency,
                    method: input.paymentMethod,
                  },
                  ...previous.paymentRecords,
                ]
              : previous.paymentRecords,
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: input.clientId,
              type: "package.created",
              detail:
                sharedClientIds.length > 0
                  ? `Added ${template.name} package purchase with ${sharedClientIds
                      .map((sharedClientId) =>
                        previous.clients.find((client) => client.id === sharedClientId)?.fullName,
                      )
                      .filter(Boolean)
                      .join(", ")}.`
                  : `Added ${template.name} package purchase.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        });
      }),
    addBodyAssessment: (input) => {
      const snapshot = stateRef.current;
      const metrics = input.metrics
        .filter((metric) => metric.label.trim() && metric.unit.trim())
        .map((metric) => ({
          id: `metric-${crypto.randomUUID()}`,
          label: metric.label.trim(),
          unit: metric.unit.trim(),
          value: metric.value,
        }));

      if (metrics.length === 0) {
        return null;
      }

      const nextAssessment: BodyAssessment = {
        id: `ba-${crypto.randomUUID()}`,
        clientId: input.clientId,
        recordedAt: input.recordedAt,
        recordedBy: snapshot.users[0]?.id ?? "user-maria",
        notes: input.notes,
        metrics,
      };

      applyCRMUpdate((previous) => ({
        ...previous,
        bodyAssessments: [nextAssessment, ...previous.bodyAssessments],
        activityEvents: [
          {
            id: `act-${crypto.randomUUID()}`,
            actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
            clientId: input.clientId,
            type: "assessment.created",
            detail: `Recorded a new body assessment entry.`,
            createdAt: timestamp(),
          },
          ...previous.activityEvents,
        ],
      }));
      return nextAssessment;
    },
    addWorkoutPlan: (input) =>
      applyCRMUpdate((previous) => {
        if (!input.title.trim() || !input.goal.trim()) {
          return previous;
        }

        const now = timestamp();
        const nextPlan = {
          id: `wp-${crypto.randomUUID()}`,
          clientId: input.clientId,
          title: input.title.trim(),
          status: "active" as const,
          goal: input.goal.trim(),
          focusAreas: input.focusAreas.filter(Boolean),
          sessionPattern: input.sessionPattern.filter(Boolean),
          activeFrom: input.activeFrom,
          createdAt: now,
          updatedAt: now,
          origin: "coach" as const,
        };

        return {
          ...previous,
          workoutPlans: [
            nextPlan,
            ...previous.workoutPlans.map((plan) =>
              plan.clientId === input.clientId && plan.status === "active"
                ? {
                    ...plan,
                    status: "archived" as const,
                    updatedAt: now,
                  }
                : plan,
            ),
          ],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: input.clientId,
              type: "workout-plan.created",
              detail: `Saved ${nextPlan.title} as the active workout block.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      }),
    addWorkoutSession: (input) =>
      applyCRMUpdate((previous) =>
        createWorkoutSessionState(
          previous,
          input,
          previous.users[0]?.name ?? authUser?.email ?? "Coach",
        ),
      ),
    updateSessionSchedule: ({
      sessionId,
      sessionDate,
      startTime,
      durationMinutes,
      location,
    }) =>
      applyCRMUpdate((previous) => {
        const session = previous.sessions.find((item) => item.id === sessionId);
        if (!session || !sessionDate || !startTime || !location.trim()) {
          return previous;
        }

        const startAt = buildIsoFromDateTime(sessionDate, startTime);
        const endAt = addMinutesToIso(startAt, durationMinutes);
        const normalizedLocation = normalizeCatalogName(location);
        const reminderAt =
          session.status === "planned" ? subtractHours(startAt, 24) : session.reminderAt;
        const hasLocation = previous.trainingLocations.some(
          (item) => item.name.toLowerCase() === normalizedLocation.toLowerCase(),
        );
        const trainingLocations = hasLocation
          ? previous.trainingLocations
          : sortTrainingLocations([
              ...previous.trainingLocations,
              { id: `location-${crypto.randomUUID()}`, name: normalizedLocation },
            ]);
        const reminderExists = previous.reminders.some(
          (reminder) => reminder.sessionId === sessionId,
        );
        const now = timestamp();

        return reconcileBillingState({
          ...previous,
          trainingLocations,
          sessions: previous.sessions.map((item) =>
            item.id === sessionId
              ? {
                  ...item,
                  startAt,
                  endAt,
                  location: normalizedLocation,
                  reminderAt,
                }
              : item,
          ),
          reminders:
            session.status === "planned"
              ? reminderExists
                ? previous.reminders.map((reminder) =>
                    reminder.sessionId === sessionId && reminderAt
                      ? { ...reminder, dueAt: reminderAt, status: "scheduled" as const }
                      : reminder,
                  )
                : reminderAt
                  ? [
                      {
                        id: `rem-${crypto.randomUUID()}`,
                        clientId: session.primaryClientId,
                        sessionId,
                        title: "24h reminder",
                        dueAt: reminderAt,
                        channel: "calendar",
                        status: "scheduled" as const,
                      },
                      ...previous.reminders,
                    ]
                  : previous.reminders
              : previous.reminders,
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: session.primaryClientId,
              type: "session.planned",
              detail: `Updated schedule details for ${session.title}.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        });
      }),
    convertLeadToClient: (leadId) => {
      const snapshot = stateRef.current;
      const lead = snapshot.leads.find((item) => item.id === leadId);
      if (!lead || snapshot.clients.some((client) => client.email === lead.email)) {
        return;
      }

      const client = {
        ...buildClientProfileFromLead(lead, snapshot.users[0]?.id ?? "user-maria"),
        id: `client-${lead.id.replace("lead-", "")}`,
      };
      const starterWorkout = buildLocalStarterWorkout(client);

      applyCRMUpdate((previous) => {
        const currentLead = previous.leads.find((item) => item.id === leadId);
        if (!currentLead || previous.clients.some((existingClient) => existingClient.email === currentLead.email)) {
          return previous;
        }

        const withClient: CRMState = {
          ...previous,
          leads: previous.leads.map((item) =>
            item.id === leadId ? { ...item, status: "converted" } : item,
          ),
          clients: [client, ...previous.clients],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: client.id,
              type: "lead.converted",
              detail: `Converted ${currentLead.fullName} into an active client profile.`,
              createdAt: timestamp(),
            },
            ...previous.activityEvents,
          ],
        };

        return applyStarterWorkoutState(withClient, client, starterWorkout);
      });

      void generateInitialWorkout({
        clientId: client.id,
        clientOverride: client,
      });
    },
    updateLeadStatus: (leadId, status) =>
      applyCRMUpdate((previous) => ({
        ...previous,
        leads: previous.leads.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                status,
                lastContactAt: timestamp(),
              }
            : lead,
        ),
      })),
    markReminderDone: (reminderId) =>
      applyCRMUpdate((previous) => ({
        ...previous,
        reminders: previous.reminders.map((reminder) =>
          reminder.id === reminderId ? { ...reminder, status: "done" } : reminder,
        ),
      })),
    updateSessionNote: (sessionId, field, value) =>
      applyCRMUpdate((previous) =>
        updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          [field]: value,
        })),
      ),
    updateExerciseNote: (sessionId, exerciseId, note) =>
      applyCRMUpdate((previous) =>
        updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          exercises: workout.exercises.map((exercise) =>
            exercise.id === exerciseId
              ? {
                  ...exercise,
                  note,
                  status:
                    exercise.status === "added" || exercise.status === "skipped"
                      ? exercise.status
                      : "modified",
                }
              : exercise,
          ),
        })),
      ),
    updateSet: (sessionId, exerciseId, setId, patch) =>
      applyCRMUpdate((previous) =>
        updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          exercises: workout.exercises.map((exercise) => {
            if (exercise.id !== exerciseId) {
              return exercise;
            }

            const nextExercise = {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, ...patch } : set,
              ),
            };

            return { ...nextExercise, status: deriveExerciseStatus(nextExercise) };
          }),
        })),
      ),
    toggleExerciseState: (sessionId, exerciseId, nextState) =>
      applyCRMUpdate((previous) =>
        updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          exercises: workout.exercises.map((exercise) =>
            exercise.id === exerciseId ? { ...exercise, status: nextState } : exercise,
          ),
        })),
      ),
    addExercise: (sessionId, name) =>
      applyCRMUpdate((previous) =>
        updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          exercises: [
            ...workout.exercises,
            {
              id: `sex-${crypto.randomUUID()}`,
              name,
              status: "added",
              sets: [createNewSet("1"), createNewSet("2"), createNewSet("3")],
            },
          ],
        })),
      ),
    regenerateSessionWorkout,
    completeSession: completeSessionAndGenerateNext,
    refreshNutritionPlan,
    upsertDraft: (draft) =>
      applyCRMUpdate((previous) => {
        const exists = previous.aiDrafts.some((item) => item.id === draft.id);
        return {
          ...previous,
          aiDrafts: exists
            ? previous.aiDrafts.map((item) => (item.id === draft.id ? draft : item))
            : [draft, ...previous.aiDrafts],
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: "AI",
              clientId: draft.clientId,
              type: "ai.draft",
              detail: `Generated ${draft.type} draft.`,
              createdAt: timestamp(),
            },
            ...previous.activityEvents,
          ],
        };
      }),
    updateDraft: (draftId, patch) =>
      applyCRMUpdate((previous) => ({
        ...previous,
        aiDrafts: previous.aiDrafts.map((draft) =>
          draft.id === draftId ? { ...draft, ...patch, updatedAt: timestamp() } : draft,
        ),
      })),
    sendDraftToTimeline: (draftId) =>
      applyCRMUpdate((previous) => {
        const draft = previous.aiDrafts.find((item) => item.id === draftId);
        if (!draft) {
          return previous;
        }

        const existingThread = previous.emailThreads.find(
          (item) => item.clientId === draft.clientId,
        );
        let thread = existingThread;
        const now = timestamp();

        const nextThreads = [...previous.emailThreads];
        if (!thread) {
          thread = {
            id: `thread-${crypto.randomUUID()}`,
            clientId: draft.clientId,
            subject: draft.subject,
            source: "crm",
            updatedAt: now,
          };
          nextThreads.unshift(thread);
        } else {
          const updatedThread = { ...thread, updatedAt: now };
          const index = nextThreads.findIndex((item) => item.id === thread?.id);
          thread = updatedThread;
          nextThreads[index] = updatedThread;
        }

        return {
          ...previous,
          emailThreads: nextThreads,
          emailMessages: [
            {
              id: `msg-${crypto.randomUUID()}`,
              threadId: thread.id,
              clientId: draft.clientId,
              direction: "outbound",
              subject: draft.subject,
              body: draft.body,
              sentAt: now,
            },
            ...previous.emailMessages,
          ],
          aiDrafts: previous.aiDrafts.map((item) =>
            item.id === draftId ? { ...item, status: "sent", updatedAt: now } : item,
          ),
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: previous.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: draft.clientId,
              type: "email.sent",
              detail: `Logged edited ${draft.type} draft into the communication timeline.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      }),
  };

  return (
    <LocaleContext.Provider value={localeValue}>
      <AuthContext.Provider value={authValue}>
        <CRMContext.Provider value={crmValue}>{children}</CRMContext.Provider>
      </AuthContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocaleContext() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocaleContext must be used inside AppProviders.");
  }
  return context;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AppProviders.");
  }
  return context;
}

export function useCRM() {
  const context = useContext(CRMContext);
  if (!context) {
    throw new Error("useCRM must be used inside AppProviders.");
  }
  return context;
}
