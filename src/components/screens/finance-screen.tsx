"use client";

import { useCRM, useLocaleContext } from "@/components/app-providers";
import { SectionCard, StatCard } from "@/components/crm-ui";
import { getNextMonthKey, getLocalMonthKey } from "@/lib/date";
import {
  getClient,
  getMonthlyRevenue,
  getMonthlyRevenueByMethod,
  getOutstandingRevenue,
  getPackageLiability,
  getRemainingUnits,
} from "@/lib/selectors";
import { PageLead, TimelineItem } from "@/components/screens/shared";

export function FinanceScreen() {
  const { state } = useCRM();
  const { t, formatCurrency, formatDate } = useLocaleContext();
  const nextMonthKey = getNextMonthKey();
  const expiring = state.packagePurchases.filter(
    (purchase) => getLocalMonthKey(purchase.expiresAt) === nextMonthKey,
  );
  const cardRevenue = getMonthlyRevenueByMethod(state, "card");
  const cashRevenue = getMonthlyRevenueByMethod(state, "cash");

  return (
    <div className="space-y-6">
      <PageLead eyebrow={t("nav.finance")} title={t("finance.title")} />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={t("dashboard.receivedThisMonth")}
          value={formatCurrency(getMonthlyRevenue(state))}
          detail={t("finance.receivedDetail")}
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
          <div className="space-y-3">
            {state.invoiceRecords.map((invoice) => {
              const client = getClient(state, invoice.clientId);
              return (
                <div key={invoice.id} className="rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--ink)]">{client?.fullName}</p>
                      <p className="text-sm text-[color:var(--muted-ink)]">
                        {invoice.id} / {formatDate(invoice.dueAt)}
                      </p>
                    </div>
                    <p className="font-semibold text-[color:var(--ink)]">{formatCurrency(invoice.amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard title={t("finance.paymentBreakdown")}>
            <div className="grid gap-3">
              <TimelineItem
                title={t("finance.cardPayments")}
                detail={t("finance.cardPaymentsDetail")}
                meta={formatCurrency(cardRevenue)}
              />
              <TimelineItem
                title={t("finance.cashPayments")}
                detail={t("finance.cashPaymentsDetail")}
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[color:var(--ink)]">{template.name}</p>
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
