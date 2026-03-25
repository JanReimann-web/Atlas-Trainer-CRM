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
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseAuthUser,
} from "firebase/auth";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowed-emails";
import { getFirebaseServices, isFirebaseConfigured } from "@/lib/firebase/client";
import { saveCRMState, subscribeToCRMState } from "@/lib/firebase/crm-store";
import { initialCRMState } from "@/lib/mock-data";
import { translate } from "@/lib/i18n";
import {
  getClientAssessments,
  getClientNutritionPlans,
  getClientSessions,
} from "@/lib/selectors";
import {
  AIDraft,
  BodyAssessment,
  CRMState,
  ClientProfile,
  CreateBodyAssessmentInput,
  CreateClientInput,
  CreateLeadInput,
  CreatePackagePurchaseInput,
  Locale,
  NutritionPlan,
  SessionExercise,
  SessionWorkout,
} from "@/lib/types";

const STATE_STORAGE_KEY = "atlas-trainer-crm-state";
const LOCALE_STORAGE_KEY = "atlas-trainer-crm-locale";

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
  signUp: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

type CRMContextValue = {
  state: CRMState;
  loading: boolean;
  error: string | null;
  persistenceMode: "local" | "firebase";
  createLead: (input: CreateLeadInput) => void;
  createClient: (input: CreateClientInput) => void;
  createClientFromLead: (leadId: string, input: CreateClientInput) => void;
  updateClient: (clientId: string, input: CreateClientInput) => void;
  addPackagePurchase: (input: CreatePackagePurchaseInput) => void;
  addBodyAssessment: (input: CreateBodyAssessmentInput) => void;
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
  completeSession: (sessionId: string) => void;
  refreshNutritionPlan: (args: {
    clientId: string;
    clientOverride?: ClientProfile;
    assessmentsOverride?: BodyAssessment[];
    trigger?: "manual" | "profile-update" | "assessment-update" | "client-create";
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

function loadInitialState(firebaseConfigured: boolean): CRMState {
  if (typeof window === "undefined" || firebaseConfigured) {
    return cloneInitialState();
  }

  const rawState = localStorage.getItem(STATE_STORAGE_KEY);
  return rawState ? (JSON.parse(rawState) as CRMState) : cloneInitialState();
}

function timestamp() {
  return new Date().toISOString();
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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

  return message;
}

function describeNutritionRefreshTrigger(
  trigger: "manual" | "profile-update" | "assessment-update" | "client-create",
  clientName: string,
) {
  if (trigger === "manual") {
    return `Generated AI nutrition guidance for ${clientName}.`;
  }

  if (trigger === "assessment-update") {
    return `Refreshed AI nutrition guidance for ${clientName} after a body assessment update.`;
  }

  if (trigger === "client-create") {
    return `Generated initial AI nutrition guidance for ${clientName}.`;
  }

  return `Refreshed AI nutrition guidance for ${clientName} after a profile update.`;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const firebaseConfigured = isFirebaseConfigured();
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
    return storedLocale === "et" || storedLocale === "en" ? storedLocale : "en";
  });
  const [authUser, setAuthUser] = useState<FirebaseAuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(firebaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [state, setState] = useState<CRMState>(() => loadInitialState(firebaseConfigured));
  const [crmLoading, setCrmLoading] = useState(firebaseConfigured);
  const [crmError, setCrmError] = useState<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const stateRef = useRef(state);

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
          setCrmError(null);
          setCrmLoading(false);
          return;
        }

        setCrmLoading(true);
        unsubscribeState = subscribeToCRMState(
          services.db,
          (nextState) => {
            setState(nextState);
            setCrmLoading(false);
            setCrmError(null);
          },
          (error) => {
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
      formatDate: (value, options) =>
        new Intl.DateTimeFormat(locale === "et" ? "et-EE" : "en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          ...options,
        }).format(new Date(value)),
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
    trigger = "manual",
  }: {
    clientId: string;
    clientOverride?: ClientProfile;
    assessmentsOverride?: BodyAssessment[];
    trigger?: "manual" | "profile-update" | "assessment-update" | "client-create";
  }) {
    const snapshot = stateRef.current;
    const client =
      clientOverride ?? snapshot.clients.find((item) => item.id === clientId);
    if (!client) {
      return;
    }

    const recentAssessments =
      assessmentsOverride ?? getClientAssessments(snapshot, clientId);
    const recentSessions = getClientSessions(snapshot, clientId);
    const currentNutritionPlan =
      getClientNutritionPlans(snapshot, clientId).find((plan) => plan.status === "active") ??
      null;

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
    }
  }

  const crmValue: CRMContextValue = {
    state,
    loading: authLoading || crmLoading,
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
      let createdClient: ClientProfile | null = null;

      applyCRMUpdate((previous) => {
        if (
          previous.clients.some(
            (client) => client.email.toLowerCase() === input.email.toLowerCase(),
          )
        ) {
          return previous;
        }

        const client: ClientProfile = {
          id: `client-${crypto.randomUUID()}`,
          ...input,
          joinedAt: timestamp(),
          ownerId: previous.users[0]?.id ?? "user-maria",
          avatarHue: randomHue(),
        };
        createdClient = client;

        return {
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
      });

      const createdClientSnapshot = createdClient as ClientProfile | null;
      if (createdClientSnapshot) {
        void refreshNutritionPlan({
          clientId: createdClientSnapshot.id,
          clientOverride: createdClientSnapshot,
          trigger: "client-create",
        });
      }
    },
    createClientFromLead: (leadId, input) => {
      let createdClient: ClientProfile | null = null;

      applyCRMUpdate((previous) => {
        const lead = previous.leads.find((item) => item.id === leadId);
        if (!lead) {
          return previous;
        }

        if (
          previous.clients.some(
            (client) =>
              client.email.toLowerCase() === input.email.toLowerCase() &&
              client.email.toLowerCase() !== lead.email.toLowerCase(),
          )
        ) {
          return previous;
        }

        const client: ClientProfile = {
          id: `client-${crypto.randomUUID()}`,
          originLeadId: leadId,
          ...input,
          joinedAt: timestamp(),
          ownerId: previous.users[0]?.id ?? "user-maria",
          avatarHue: randomHue(),
        };
        createdClient = client;

        const now = timestamp();

        return {
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
              detail: `Converted ${lead.fullName} into an active client profile.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      });

      const createdClientSnapshot = createdClient as ClientProfile | null;
      if (createdClientSnapshot) {
        void refreshNutritionPlan({
          clientId: createdClientSnapshot.id,
          clientOverride: createdClientSnapshot,
          trigger: "client-create",
        });
      }
    },
    updateClient: (clientId, input) => {
      let updatedClient: ClientProfile | null = null;

      applyCRMUpdate((previous) => {
        const existingClient = previous.clients.find((client) => client.id === clientId);
        if (!existingClient) {
          return previous;
        }

        const now = timestamp();
        updatedClient = {
          ...existingClient,
          ...input,
        };
        const relatedLead = previous.leads.find(
          (lead) =>
            lead.id === existingClient.originLeadId ||
            (!existingClient.originLeadId &&
              lead.status === "converted" &&
              lead.email.toLowerCase() === existingClient.email.toLowerCase()),
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

      const updatedClientSnapshot = updatedClient as ClientProfile | null;
      if (updatedClientSnapshot) {
        void refreshNutritionPlan({
          clientId,
          clientOverride: updatedClientSnapshot,
          trigger: "profile-update",
        });
      }
    },
    addPackagePurchase: (input) =>
      applyCRMUpdate((previous) => {
        const template = previous.packageTemplates.find((item) => item.id === input.templateId);
        if (!template) {
          return previous;
        }

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

        return {
          ...previous,
          packagePurchases: [
            {
              id: purchaseId,
              clientId: input.clientId,
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
                    method: "manual entry",
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
              detail: `Added ${template.name} package purchase.`,
              createdAt: now,
            },
            ...previous.activityEvents,
          ],
        };
      }),
    addBodyAssessment: (input) => {
      let assessmentSnapshot: BodyAssessment | null = null;
      let priorAssessments: BodyAssessment[] = [];

      applyCRMUpdate((previous) => {
        priorAssessments = previous.bodyAssessments.filter(
          (assessment) => assessment.clientId === input.clientId,
        );
        const metrics = input.metrics
          .filter((metric) => metric.label.trim() && metric.unit.trim())
          .map((metric) => ({
            id: `metric-${crypto.randomUUID()}`,
            label: metric.label.trim(),
            unit: metric.unit.trim(),
            value: metric.value,
          }));

        if (metrics.length === 0) {
          return previous;
        }

        const nextAssessment: BodyAssessment = {
          id: `ba-${crypto.randomUUID()}`,
          clientId: input.clientId,
          recordedAt: input.recordedAt,
          recordedBy: previous.users[0]?.id ?? "user-maria",
          notes: input.notes,
          metrics,
        };
        assessmentSnapshot = nextAssessment;

        return {
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
        };
      });

      const assessmentToRefresh = assessmentSnapshot as BodyAssessment | null;
      if (assessmentToRefresh) {
        void refreshNutritionPlan({
          clientId: input.clientId,
          assessmentsOverride: [assessmentToRefresh, ...priorAssessments],
          trigger: "assessment-update",
        });
      }
    },
    convertLeadToClient: (leadId) => {
      let createdClient: ClientProfile | null = null;

      applyCRMUpdate((previous) => {
        const lead = previous.leads.find((item) => item.id === leadId);
        if (!lead || previous.clients.some((client) => client.email === lead.email)) {
          return previous;
        }

        const client = {
          ...buildClientProfileFromLead(lead, previous.users[0]?.id ?? "user-maria"),
          id: `client-${lead.id.replace("lead-", "")}`,
        };
        createdClient = client;

        return {
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
              detail: `Converted ${lead.fullName} into an active client profile.`,
              createdAt: timestamp(),
            },
            ...previous.activityEvents,
          ],
        };
      });

      const createdClientSnapshot = createdClient as ClientProfile | null;
      if (createdClientSnapshot) {
        void refreshNutritionPlan({
          clientId: createdClientSnapshot.id,
          clientOverride: createdClientSnapshot,
          trigger: "client-create",
        });
      }
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
    completeSession: (sessionId) =>
      applyCRMUpdate((previous) => {
        const existingSession = previous.sessions.find((session) => session.id === sessionId);
        const alreadyCompleted = existingSession?.status === "completed";
        const nextState = updateWorkout(previous, sessionId, (workout) => ({
          ...workout,
          status: "completed",
        }));

        return {
          ...nextState,
          sessions: nextState.sessions.map((session) =>
            session.id === sessionId ? { ...session, status: "completed" } : session,
          ),
          packagePurchases: nextState.packagePurchases.map((purchase) => {
            if (
              purchase.id === existingSession?.packagePurchaseId &&
              !alreadyCompleted
            ) {
              return {
                ...purchase,
                usedUnits: Math.min(purchase.totalUnits, purchase.usedUnits + 1),
              };
            }

            return purchase;
          }),
          activityEvents: [
            {
              id: `act-${crypto.randomUUID()}`,
              actor: nextState.users[0]?.name ?? authUser?.email ?? "Coach",
              clientId: existingSession?.primaryClientId,
              type: "session.completed",
              detail: `Marked ${existingSession?.title ?? "session"} as completed.`,
              createdAt: timestamp(),
            },
            ...nextState.activityEvents,
          ],
        };
      }),
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
