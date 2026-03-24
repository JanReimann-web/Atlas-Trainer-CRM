"use client";

import { FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";

type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  persistenceReady: Promise<void>;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let cachedServices: FirebaseServices | null = null;

export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export function getFirebaseServices(): FirebaseServices | null {
  if (typeof window === "undefined" || !isFirebaseConfigured()) {
    return null;
  }

  if (cachedServices) {
    return cachedServices;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  cachedServices = {
    app,
    auth,
    db,
    storage,
    persistenceReady: setPersistence(auth, browserLocalPersistence).catch(() => undefined),
  };

  return cachedServices;
}
