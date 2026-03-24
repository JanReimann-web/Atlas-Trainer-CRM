"use client";

import {
  collection,
  doc,
  Firestore,
  onSnapshot,
  QuerySnapshot,
  writeBatch,
} from "firebase/firestore";
import { initialCRMState } from "@/lib/mock-data";
import { CRMState } from "@/lib/types";

const WORKSPACE_ID = process.env.NEXT_PUBLIC_FIREBASE_WORKSPACE_ID || "primary";
const STATE_VERSION = 1;

const STATE_SLICE_KEYS = [
  "users",
  "leads",
  "clients",
  "packageTemplates",
  "packagePurchases",
  "sessions",
  "plannedWorkouts",
  "sessionWorkouts",
  "bodyAssessments",
  "workoutPlans",
  "nutritionPlans",
  "exerciseLibrary",
  "emailThreads",
  "emailMessages",
  "reminders",
  "invoiceRecords",
  "paymentRecords",
  "activityEvents",
  "aiDrafts",
] as const satisfies ReadonlyArray<keyof CRMState>;

type StateSliceKey = (typeof STATE_SLICE_KEYS)[number];

type StateSliceDocument<K extends StateSliceKey = StateSliceKey> = {
  items: CRMState[K];
  updatedAt: string;
  version: number;
};

function cloneInitialState(): CRMState {
  return structuredClone(initialCRMState);
}

function workspaceDocument(db: Firestore) {
  return doc(db, "workspaces", WORKSPACE_ID);
}

function stateCollection(db: Firestore) {
  return collection(workspaceDocument(db), "state");
}

function stateDocument(db: Firestore, key: StateSliceKey) {
  return doc(stateCollection(db), key);
}

function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeForFirestore(entryValue)]),
    ) as T;
  }

  return value;
}

function serializeSlice<K extends StateSliceKey>(
  key: K,
  items: CRMState[K],
): StateSliceDocument<K> {
  return {
    items: sanitizeForFirestore(items),
    updatedAt: new Date().toISOString(),
    version: STATE_VERSION,
  };
}

function parseSnapshot(snapshot: QuerySnapshot): CRMState {
  const nextState = cloneInitialState();
  const fallbackState = cloneInitialState();
  const nextStateRecord = nextState as Record<StateSliceKey, CRMState[StateSliceKey]>;

  snapshot.docs.forEach((slice) => {
    const key = slice.id as StateSliceKey;
    if (!STATE_SLICE_KEYS.includes(key)) {
      return;
    }

    const data = slice.data() as StateSliceDocument;
    nextStateRecord[key] = (data.items ?? fallbackState[key]) as CRMState[typeof key];
  });

  return nextState;
}

async function seedCRMState(db: Firestore) {
  const batch = writeBatch(db);

  batch.set(
    workspaceDocument(db),
    {
      seededAt: new Date().toISOString(),
      version: STATE_VERSION,
    },
    { merge: true },
  );

  STATE_SLICE_KEYS.forEach((key) => {
    batch.set(stateDocument(db, key), serializeSlice(key, cloneInitialState()[key]));
  });

  await batch.commit();
}

function areSlicesEqual<K extends StateSliceKey>(
  left: CRMState[K],
  right: CRMState[K],
) {
  return JSON.stringify(sanitizeForFirestore(left)) === JSON.stringify(sanitizeForFirestore(right));
}

export function subscribeToCRMState(
  db: Firestore,
  onData: (state: CRMState) => void,
  onError?: (error: Error) => void,
) {
  let seeded = false;

  return onSnapshot(
    stateCollection(db),
    (snapshot) => {
      if (snapshot.empty) {
        if (!seeded) {
          seeded = true;
          void seedCRMState(db).catch((error) => {
            onError?.(
              error instanceof Error ? error : new Error("Could not seed Firestore workspace."),
            );
          });
        }
        return;
      }

      onData(parseSnapshot(snapshot));
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function saveCRMState(
  db: Firestore,
  nextState: CRMState,
  previousState?: CRMState,
) {
  const batch = writeBatch(db);
  let changed = false;

  batch.set(
    workspaceDocument(db),
    {
      updatedAt: new Date().toISOString(),
      version: STATE_VERSION,
    },
    { merge: true },
  );

  STATE_SLICE_KEYS.forEach((key) => {
    if (previousState && areSlicesEqual(previousState[key], nextState[key])) {
      return;
    }

    changed = true;
    batch.set(stateDocument(db, key), serializeSlice(key, nextState[key]));
  });

  if (!changed) {
    return;
  }

  await batch.commit();
}
