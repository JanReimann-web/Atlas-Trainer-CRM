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
  AIDraft,
  CRMState,
  ClientProfile,
  Locale,
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
  convertLeadToClient: (leadId: string) => void;
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

  const crmValue: CRMContextValue = {
    state,
    loading: authLoading || crmLoading,
    error: crmError,
    persistenceMode: firebaseConfigured ? "firebase" : "local",
    convertLeadToClient: (leadId) =>
      applyCRMUpdate((previous) => {
        const lead = previous.leads.find((item) => item.id === leadId);
        if (!lead || previous.clients.some((client) => client.email === lead.email)) {
          return previous;
        }

        const client: ClientProfile = {
          id: `client-${lead.id.replace("lead-", "")}`,
          fullName: lead.fullName,
          email: lead.email,
          phone: lead.phone,
          gender: "unspecified",
          preferredLanguage: lead.preferredLanguage,
          goals: [lead.goal],
          tags: ["new-client"],
          joinedAt: timestamp(),
          consentStatus: "pending",
          healthFlags: [],
          notes: lead.notes,
          ownerId: previous.users[0]?.id ?? "user-maria",
          avatarHue: 42,
        };

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
      }),
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
