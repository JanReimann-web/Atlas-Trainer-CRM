"use client";

import { ReactNode } from "react";

export function PageLead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted-ink)]">
        {eyebrow}
      </p>
      <h1 className="break-words font-display text-[clamp(1.7rem,7.5vw,3.65rem)] leading-[0.96] tracking-[-0.03em] [text-wrap:balance] text-[color:var(--ink)] sm:text-5xl sm:tracking-normal">
        {title}
      </h1>
      {subtitle ? (
        <p className="max-w-3xl break-words text-sm leading-7 text-[color:var(--muted-ink)]">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function TimelineItem({
  title,
  detail,
  meta,
  actions,
}: {
  title: string;
  detail: string;
  meta: string;
  actions?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[22px] border border-[color:var(--line-soft)] bg-white/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-semibold text-[color:var(--ink)]">{title}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
          {actions}
          <p className="break-words text-xs uppercase tracking-[0.24em] text-[color:var(--muted-ink)]">
            {meta}
          </p>
        </div>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-[color:var(--muted-ink)]">
        {detail}
      </p>
    </div>
  );
}
