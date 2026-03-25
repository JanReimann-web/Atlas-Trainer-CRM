"use client";

import { ReactNode } from "react";

export function PageLead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--muted-ink)]">
        {eyebrow}
      </p>
      <h1 className="font-display text-5xl leading-none text-[color:var(--ink)]">
        {title}
      </h1>
      {subtitle ? (
        <p className="max-w-3xl text-sm leading-7 text-[color:var(--muted-ink)]">{subtitle}</p>
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
    <div className="rounded-[22px] border border-[color:var(--line-soft)] bg-white/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[color:var(--ink)]">{title}</p>
        <div className="flex items-center gap-3">
          {actions}
          <p className="text-xs uppercase tracking-[0.24em] text-[color:var(--muted-ink)]">
            {meta}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-ink)]">{detail}</p>
    </div>
  );
}
