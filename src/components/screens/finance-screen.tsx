"use client";

import { useMemo, useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import { EmptyState, SectionCard, StatCard } from "@/components/crm-ui";
import { getCurrentMonthKey, getNextMonthKey, getLocalMonthKey } from "@/lib/date";
import {
  getClient,
  getInvoiceOutstandingAmount,
  getMonthlyRevenue,
  getMonthlyRevenueByMethod,
  getOutstandingRevenue,
  getPackageLiability,
  getPackageTemplate,
  getRemainingUnits,
} from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

function getMonthDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date();
  }

  return new Date(year, month - 1, 1);
}

function buildMonthOptions(monthKeys: string[], currentMonthKey: string) {
  const uniqueMonthKeys = [...new Set([...monthKeys.filter(Boolean), currentMonthKey])];
  const oldestMonthKey = [...uniqueMonthKeys].sort()[0] ?? currentMonthKey;
  const oldestMonthDate = getMonthDate(oldestMonthKey);
  const currentMonthDate = getMonthDate(currentMonthKey);
  const options: string[] = [];

  for (
    let cursor = currentMonthDate;
    cursor >= oldestMonthDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
  ) {
    options.push(getLocalMonthKey(cursor));
  }

  return options;
}

export function FinanceScreen() {
  const { state } = useCRM();
  const { t, formatCurrency, formatDate, locale } = useLocaleContext();
  const currentMonthKey = getCurrentMonthKey();
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const localeTag = locale === "et" ? "et-EE" : "en-GB";
  const nextMonthKey = getNextMonthKey();
  const expiring = state.packagePurchases.filter(
    (purchase) => getLocalMonthKey(purchase.expiresAt) === nextMonthKey,
  );
  const monthOptions = useMemo(
    () =>
      buildMonthOptions(
        [
          ...state.invoiceRecords.map((invoice) => getLocalMonthKey(invoice.dueAt)),
          ...state.paymentRecords.map((payment) => getLocalMonthKey(payment.paidAt)),
        ],
        currentMonthKey,
      ),
    [currentMonthKey, state.invoiceRecords, state.paymentRecords],
  );
  const activeMonthKey = monthOptions.includes(selectedMonthKey)
    ? selectedMonthKey
    : currentMonthKey;

  const selectedMonthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, {
        month: "long",
        year: "numeric",
      }).format(getMonthDate(activeMonthKey)),
    [activeMonthKey, localeTag],
  );
  const monthlyRevenue = getMonthlyRevenue(state, activeMonthKey);
  const cardRevenue = getMonthlyRevenueByMethod(state, "card", activeMonthKey);
  const cashRevenue = getMonthlyRevenueByMethod(state, "cash", activeMonthKey);
  const filteredInvoices = useMemo(
    () =>
      [...state.invoiceRecords]
        .filter((invoice) => getLocalMonthKey(invoice.dueAt) === activeMonthKey)
        .sort((left, right) => {
          const leftKey = left.issuedAt || left.dueAt;
          const rightKey = right.issuedAt || right.dueAt;
          return rightKey.localeCompare(leftKey);
        }),
    [activeMonthKey, state.invoiceRecords],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageLead eyebrow={t("nav.finance")} title={t("finance.title")} />
        <label className="min-w-[220px] space-y-2 text-sm">
          <span className="font-medium text-[color:var(--ink)]">{t("finance.monthFilter")}</span>
          <select
            value={activeMonthKey}
            onChange={(event) => setSelectedMonthKey(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/80 px-4 py-3 text-sm outline-none"
          >
            {monthOptions.map((monthKey) => (
              <option key={monthKey} value={monthKey}>
                {new Intl.DateTimeFormat(localeTag, {
                  month: "long",
                  year: "numeric",
                }).format(getMonthDate(monthKey))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("finance.received")}
          value={formatCurrency(monthlyRevenue)}
          detail={`${t("finance.receivedDetail")} / ${selectedMonthLabel}`}
        />
        <StatCard
          label={t("dashboard.outstanding")}
          value={formatCurrency(getOutstandingRevenue(state))}
          detail={t("finance.outstandingDetail")}
        />
        <StatCard
          label={t("dashboard.packageLiability")}
          value={formatCurrency(getPackageLiability(state))}
          detail={t("finance.liabilityDetail")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title={t("finance.invoices")} help={t("help.finance")}>
          {filteredInvoices.length === 0 ? (
            <EmptyState
              title={t("common.none")}
              body={`${t("finance.noInvoicesForMonth")} ${selectedMonthLabel}.`}
            />
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((invoice) => {
              const client = getClient(state, invoice.clientId);
              const purchase = invoice.packagePurchaseId
                ? state.packagePurchases.find((item) => item.id === invoice.packagePurchaseId)
                : null;
              const template = purchase
                ? getPackageTemplate(state, purchase.templateId)
                : null;
              const linkedSession = invoice.sessionId
                ? state.sessions.find((session) => session.id === invoice.sessionId)
                : null;
              const amountDue = getInvoiceOutstandingAmount(state, invoice);
              return (
                <div key={invoice.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-[color:var(--ink)]">
                        {client?.fullName}
                      </p>
                      <p className="break-words text-sm text-[color:var(--muted-ink)]">
                        {invoice.source === "session-debt"
                          ? `${t("finance.sessionDebtLabel")} / ${linkedSession?.title ?? invoice.description ?? invoice.id}`
                          : `${t("finance.packageInvoiceLabel")} / ${template?.name ?? invoice.id}`}{" "}
                        / {formatDate(invoice.dueAt)}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-semibold text-[color:var(--ink)]">{formatCurrency(amountDue)}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">
                        {formatCurrency(invoice.amount)}
                      </p>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard title={t("finance.paymentBreakdown")}>
            <div className="grid gap-3">
              <TimelineItem
                title={t("finance.cardPayments")}
                detail={`${t("finance.cardPaymentsDetail")} / ${selectedMonthLabel}`}
                meta={formatCurrency(cardRevenue)}
              />
              <TimelineItem
                title={t("finance.cashPayments")}
                detail={`${t("finance.cashPaymentsDetail")} / ${selectedMonthLabel}`}
                meta={formatCurrency(cashRevenue)}
              />
            </div>
          </SectionCard>

          <SectionCard title={t("finance.expiring")}>
            <div className="space-y-3">
              {expiring.map((purchase) => {
                const client = getClient(state, purchase.clientId);
                return (
                  <TimelineItem
                    key={purchase.id}
                    title={client?.fullName ?? purchase.id}
                    detail={`${getRemainingUnits(purchase)} ${t("finance.expiringRemaining")}`}
                    meta={formatDate(purchase.expiresAt)}
                  />
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title={t("finance.templates")}>
            <div className="grid gap-3">
              {state.packageTemplates.map((template) => (
                <div key={template.id} className="rounded-[22px] bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="break-words font-semibold text-[color:var(--ink)]">{template.name}</p>
                    <p className="text-sm text-[color:var(--muted-ink)]">{formatCurrency(template.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
