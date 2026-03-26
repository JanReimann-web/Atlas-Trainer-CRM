"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAuth, useCRM, useLocaleContext } from "@/components/app-providers";
import { LanguageToggle } from "@/components/crm-ui";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowed-emails";

type AuthMode = "signin" | "signup";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, error, firebaseConfigured, signIn, signUp } = useAuth();
  const { error: crmError, hydrated } = useCRM();
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
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password.trim()) {
      setLocalError(t("auth.fillAllFields"));
      return;
    }

    if (mode === "signup" && password.trim().length < 6) {
      setLocalError(t("auth.passwordHint"));
      return;
    }

    if (!isAllowedEmail(normalizedEmail)) {
      setLocalError(t("auth.restrictedAccess"));
      return;
    }

    if (mode === "signin") {
      await signIn(normalizedEmail, password);
      return;
    }

    await signUp(normalizedEmail, password);
  }

  if (!firebaseConfigured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <div className="flex justify-end">
            <div className="w-36">
              <LanguageToggle compact />
            </div>
          </div>
          <div className="panel-surface w-full rounded-[36px] p-8 text-center">
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
      </div>
    );
  }

  if (firebaseConfigured && user && !hydrated && crmError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 py-8">
        <div className="w-full max-w-lg space-y-4">
          <div className="flex justify-end">
            <div className="w-36">
              <LanguageToggle compact />
            </div>
          </div>
          <div className="panel-surface w-full rounded-[36px] p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted-ink)]">
              {t("common.firebaseConnected")}
            </p>
            <h1 className="mt-4 font-display text-4xl text-[color:var(--ink)]">
              {t("auth.loadingTitle")}
            </h1>
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm leading-7 text-rose-900">
              {crmError}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 py-8">
      <div className="w-full max-w-md space-y-4 sm:max-w-xl lg:max-w-5xl">
        <div className="flex justify-end">
          <div className="w-36">
            <LanguageToggle compact />
          </div>
        </div>

        <div className="panel-surface w-full overflow-hidden rounded-[32px] p-3 sm:p-4 lg:p-8">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6">
            <section className="rounded-[28px] bg-[color:var(--sand-2)] p-6 text-center sm:p-8 lg:rounded-[32px] lg:text-left">
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted-ink)]">
                Atlas Trainer CRM
              </p>
              <h1 className="mt-4 font-display text-[clamp(3rem,9vw,5.4rem)] leading-[0.92] text-[color:var(--ink)]">
                {t("auth.title")}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--muted-ink)]">
                {t("auth.subtitle")}
              </p>
            </section>

            <section className="rounded-[28px] border border-[color:var(--line-soft)] bg-white/70 p-5 sm:p-8 lg:rounded-[32px]">
              <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:var(--sand-2)] p-1">
                {(["signin", "signup"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setMode(item);
                      setLocalError(null);
                    }}
                    className={`flex min-h-[52px] items-center justify-center rounded-full px-2 py-3 text-[13px] font-semibold tracking-tight transition sm:px-4 sm:text-sm ${
                      mode === item ? "bg-[color:var(--ink)] text-white" : "text-[color:var(--ink)]"
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
                  className="w-full rounded-2xl bg-[color:var(--ink)] px-4 py-3 text-sm font-semibold text-white sm:py-4"
                >
                  {submitLabel}
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
