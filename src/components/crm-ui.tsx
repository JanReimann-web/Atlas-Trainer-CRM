"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo } from "react";
import { useAuth, useCRM, useLocaleContext } from "@/components/app-providers";
import { getUpcomingSessions } from "@/lib/selectors";

export function InfoHint({ content }: { content: string }) {
  return (
    <details className="relative inline-block">
      <summary className="flex h-5 w-5 cursor-pointer list-none items-center justify-center rounded-full border border-[color:var(--line-soft)] bg-white/85 text-[11px] font-semibold text-[color:var(--ink)] shadow-sm transition hover:bg-[color:var(--sand-2)]">
        i
      </summary>
      <div className="absolute left-0 top-7 z-20 w-64 rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--paper)] p-3 text-sm leading-6 text-[color:var(--muted-ink)] shadow-[0_18px_45px_rgba(34,48,38,0.18)]">
        {content}
      </div>
    </details>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLocaleContext();
  const styles: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-900",
    active: "bg-emerald-100 text-emerald-900",
    completed: "bg-emerald-100 text-emerald-900",
    sent: "bg-emerald-100 text-emerald-900",
    ready: "bg-emerald-100 text-emerald-900",
    pending: "bg-amber-100 text-amber-900",
    partial: "bg-amber-100 text-amber-900",
    draft: "bg-stone-100 text-stone-800",
    reviewed: "bg-stone-100 text-stone-800",
    scheduled: "bg-sky-100 text-sky-900",
    planned: "bg-sky-100 text-sky-900",
    synced: "bg-sky-100 text-sky-900",
    manual: "bg-stone-100 text-stone-800",
    overdue: "bg-rose-100 text-rose-900",
    cancelled: "bg-rose-100 text-rose-900",
    "no-show": "bg-rose-100 text-rose-900",
    modified: "bg-orange-100 text-orange-900",
    added: "bg-violet-100 text-violet-900",
    skipped: "bg-zinc-200 text-zinc-900",
    "in-progress": "bg-indigo-100 text-indigo-900",
    live: "bg-indigo-100 text-indigo-900",
  };

  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[status] ?? "bg-stone-100 text-stone-800"
      }`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="panel-surface rounded-[28px] p-5">
      <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--muted-ink)]">
        {label}
      </p>
      <p className="mt-3 font-display text-4xl text-[color:var(--ink)]">{value}</p>
      {detail ? (
        <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{detail}</p>
      ) : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  help,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  help?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel-surface rounded-[30px] p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-[color:var(--ink)]">{title}</h2>
            {help ? <InfoHint content={help} /> : null}
          </div>
          {subtitle ? (
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted-ink)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[color:var(--line-soft)] bg-white/50 p-6 text-sm leading-6 text-[color:var(--muted-ink)]">
      <p className="font-semibold text-[color:var(--ink)]">{title}</p>
      <p className="mt-2">{body}</p>
    </div>
  );
}

export function DataLabel({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children?: ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="flex items-center gap-2 font-medium text-[color:var(--ink)]">
        {label}
        {help ? <InfoHint content={help} /> : null}
      </span>
      {children}
    </label>
  );
}

export function LanguageToggle({
  compact = false,
  showLabel = false,
}: {
  compact?: boolean;
  showLabel?: boolean;
}) {
  const { locale, setLocale, t } = useLocaleContext();

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {showLabel ? (
        <div className="flex items-center justify-between">
          <span className="font-medium text-[color:var(--ink)]">{t("app.locale")}</span>
          <InfoHint content={t("app.localeHelp")} />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:var(--sand-2)] p-1">
        {(["en", "et"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLocale(item)}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
              locale === item ? "bg-[color:var(--ink)] text-white" : "text-[color:var(--ink)]"
            }`}
          >
            {item.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, persistenceMode } = useCRM();
  const { user, liveData, firebaseConfigured, signOutUser } = useAuth();
  const { t, formatDate } = useLocaleContext();
  const nextSession = useMemo(() => getUpcomingSessions(state, 1)[0], [state]);

  const navItems = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/leads", label: t("nav.leads") },
    { href: "/clients", label: t("nav.clients") },
    { href: "/calendar", label: t("nav.calendar") },
    { href: "/plans", label: t("nav.plans") },
    { href: "/communications", label: t("nav.communications") },
    { href: "/finance", label: t("nav.finance") },
    { href: "/settings", label: t("nav.settings") },
    { href: "/activity", label: t("nav.activity") },
  ];

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--ink)]">
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-6">
        <aside className="panel-surface hidden rounded-[36px] p-5 lg:flex lg:flex-col">
          <div className="space-y-8">
            <div className="rounded-[28px] bg-[color:var(--sand-2)] p-5">
              <h1 className="font-display text-4xl leading-none text-[color:var(--ink)]">
                {t("app.name")}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted-ink)]">
                {t("app.tagline")}
              </p>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? "bg-[color:var(--clay)] text-white shadow-[0_12px_32px_rgba(196,93,66,0.26)]"
                        : "text-[color:var(--ink)] hover:bg-white/70"
                    }`}
                  >
                    <span>{item.label}</span>
                    {active ? <span className="text-xs">*</span> : null}
                  </Link>
                );
              })}
            </nav>

            <div className="rounded-[28px] border border-[color:var(--line-soft)] bg-white/75 p-4 text-sm">
              <LanguageToggle showLabel />
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <header className="panel-surface rounded-[32px] px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted-ink)]">
                  {t("app.allUsers")}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-[color:var(--sage)]/15 px-3 py-1 text-sm font-semibold text-[color:var(--sage)]">
                    {state.users.map((coach) => coach.name.split(" ")[0]).join(" + ")}
                  </span>
                  {user?.email ? (
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-[color:var(--ink)]">
                      {user.email}
                    </span>
                  ) : null}
                  {nextSession ? (
                    <Link
                      href={`/clients/${nextSession.primaryClientId}/sessions/${nextSession.id}`}
                      className="inline-flex max-w-full items-center gap-3 rounded-full bg-[color:var(--ink)] px-3 py-2 text-[color:var(--paper)] shadow-[0_14px_32px_rgba(27,39,33,0.18)] transition hover:translate-y-[-1px] hover:bg-[#24342c]"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-lg leading-none text-white">
                        &gt;
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/72">
                          {t("app.upcomingSession")}
                        </span>
                        <span className="block truncate text-sm font-semibold text-white">
                          {formatDate(nextSession.startAt)}
                        </span>
                      </span>
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-3 md:items-end">
                <div className="w-full md:hidden">
                  <LanguageToggle compact />
                </div>
                <div className="rounded-[24px] bg-[color:var(--sand-2)] px-4 py-3 text-sm leading-6 text-[color:var(--muted-ink)]">
                  <p className="font-semibold text-[color:var(--ink)]">
                    {liveData ? t("common.firebaseConnected") : t("common.outlookReady")}
                  </p>
                  <p>
                    {liveData
                      ? t("common.firebaseConnectedDetail")
                      : t("common.integrationFallbackDetail")}
                  </p>
                  {firebaseConfigured && persistenceMode === "firebase" ? (
                    <button
                      type="button"
                      onClick={() => void signOutUser()}
                      className="mt-3 rounded-full bg-[color:var(--ink)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      {t("auth.signOut")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main>{children}</main>
        </div>
      </div>

      <nav className="panel-surface fixed bottom-3 left-3 right-3 z-30 overflow-x-auto rounded-[28px] px-3 py-2 lg:hidden">
        <div className="flex min-w-max items-center gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
                  active ? "bg-[color:var(--clay)] text-white" : "text-[color:var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
