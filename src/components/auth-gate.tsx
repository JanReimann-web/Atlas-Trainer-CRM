"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth, useLocaleContext } from "@/components/app-providers";

type AuthMode = "signin" | "signup";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, error, firebaseConfigured, signIn, signUp } = useAuth();
  const { t } = useLocaleContext();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submitLabel = useMemo(
    () => (mode === "signin" ? t("auth.signIn") : t("auth.createAccount")),
    [mode, t],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError(t("auth.fillAllFields"));
      return;
    }

    if (mode === "signup" && password.trim().length < 6) {
      setLocalError(t("auth.passwordHint"));
      return;
    }

    if (mode === "signin") {
      await signIn(email.trim(), password);
      return;
    }

    await signUp(email.trim(), password);
  }

  if (!firebaseConfigured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4">
        <div className="panel-surface w-full max-w-lg rounded-[36px] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted-ink)]">
            {t("auth.connecting")}
          </p>
          <h1 className="mt-4 font-display text-4xl text-[color:var(--ink)]">
            {t("auth.loadingTitle")}
          </h1>
          <p className="mt-4 text-sm leading-7 text-[color:var(--muted-ink)]">
            {user ? t("auth.syncingWorkspace") : t("auth.loadingSubtitle")}
          </p>
        </div>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 py-8">
      <div className="panel-surface grid w-full max-w-5xl gap-6 rounded-[40px] p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
        <section className="rounded-[32px] bg-[color:var(--sand-2)] p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted-ink)]">
            Atlas Trainer CRM
          </p>
          <h1 className="mt-4 font-display text-5xl leading-none text-[color:var(--ink)]">
            {t("auth.title")}
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[color:var(--muted-ink)]">
            {t("auth.subtitle")}
          </p>
          <div className="mt-8 space-y-3 text-sm text-[color:var(--muted-ink)]">
            <p>{t("auth.featureOne")}</p>
            <p>{t("auth.featureTwo")}</p>
            <p>{t("auth.featureThree")}</p>
          </div>
        </section>

        <section className="rounded-[32px] border border-[color:var(--line-soft)] bg-white/70 p-8">
          <div className="flex items-center gap-2 rounded-full bg-[color:var(--sand-2)] p-1">
            {(["signin", "signup"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setLocalError(null);
                }}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === item
                    ? "bg-[color:var(--ink)] text-white"
                    : "text-[color:var(--ink)]"
                }`}
              >
                {item === "signin" ? t("auth.signIn") : t("auth.createAccount")}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-[color:var(--ink)]">{t("auth.email")}</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 outline-none"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium text-[color:var(--ink)]">{t("auth.password")}</span>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white px-4 py-3 outline-none"
              />
            </label>

            {(localError || error) ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {localError || error}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-[color:var(--ink)] px-4 py-3 text-sm font-semibold text-white"
            >
              {submitLabel}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
