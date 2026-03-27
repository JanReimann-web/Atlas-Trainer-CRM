import { getCurrentMonthKey, getLocalDateKey, getLocalMonthKey, getTodayDateKey } from "@/lib/date";
import {
  CRMState,
  InvoiceRecord,
  PackagePurchase,
  PackageTemplate,
  Session,
  SessionExercise,
  SessionKind,
  SessionWorkout,
} from "@/lib/types";

function compareSessionStart(left: CRMState["sessions"][number], right: CRMState["sessions"][number]) {
  if (!left.startAt && !right.startAt) {
    return 0;
  }

  if (!left.startAt) {
    return 1;
  }

  if (!right.startAt) {
    return -1;
  }

  return left.startAt.localeCompare(right.startAt);
}

function getSessionBillingMoment(session: Session) {
  return session.endAt || session.startAt || "";
}

function getPurchaseCoverageStart(purchase: PackagePurchase) {
  return purchase.purchasedAt || purchase.startsAt;
}

function getClientIdsForSession(session: Session) {
  return [...new Set([session.primaryClientId, ...session.clientIds])];
}

function comparePackageCoverageOrder(
  left: { purchase: PackagePurchase; template: PackageTemplate },
  right: { purchase: PackagePurchase; template: PackageTemplate },
) {
  const leftStart = getPurchaseCoverageStart(left.purchase);
  const rightStart = getPurchaseCoverageStart(right.purchase);
  if (leftStart !== rightStart) {
    return leftStart.localeCompare(rightStart);
  }

  if (left.purchase.expiresAt !== right.purchase.expiresAt) {
    return left.purchase.expiresAt.localeCompare(right.purchase.expiresAt);
  }

  if (left.purchase.purchasedAt !== right.purchase.purchasedAt) {
    return left.purchase.purchasedAt.localeCompare(right.purchase.purchasedAt);
  }

  return left.purchase.id.localeCompare(right.purchase.id);
}

function compareCompletedSessionCoverageOrder(left: Session, right: Session) {
  const leftMoment = getSessionBillingMoment(left);
  const rightMoment = getSessionBillingMoment(right);

  if (leftMoment && rightMoment && leftMoment !== rightMoment) {
    return leftMoment.localeCompare(rightMoment);
  }

  if (leftMoment && !rightMoment) {
    return -1;
  }

  if (!leftMoment && rightMoment) {
    return 1;
  }

  return left.id.localeCompare(right.id);
}

function canPurchaseCoverSession(
  purchase: PackagePurchase,
  template: PackageTemplate,
  session: Session,
) {
  if (template.tier !== session.kind) {
    return false;
  }

  const linkedClientIds = getPurchaseLinkedClientIds(purchase);
  const sessionClientIds = getClientIdsForSession(session);
  if (!sessionClientIds.some((clientId) => linkedClientIds.includes(clientId))) {
    return false;
  }

  const billingMoment = getSessionBillingMoment(session);
  if (!billingMoment) {
    return false;
  }

  const coverageStart = getPurchaseCoverageStart(purchase);
  if (coverageStart && billingMoment < coverageStart) {
    return false;
  }

  if (purchase.expiresAt && billingMoment > purchase.expiresAt) {
    return false;
  }

  return true;
}

export function getClient(state: CRMState, clientId: string) {
  return state.clients.find((client) => client.id === clientId);
}

export function getPurchaseLinkedClientIds(
  purchase: CRMState["packagePurchases"][number],
) {
  return [...new Set([purchase.clientId, ...(purchase.sharedClientIds ?? [])])];
}

export function getSessionUnitPrice(state: CRMState, kind: SessionKind) {
  const sameKindTemplates = state.packageTemplates.filter((template) => template.tier === kind);
  const singleSessionTemplate = sameKindTemplates.find((template) => template.sessionCount === 1);
  if (singleSessionTemplate) {
    return singleSessionTemplate.price;
  }

  const perSessionValues = sameKindTemplates
    .filter((template) => template.sessionCount > 0)
    .map((template) => template.price / template.sessionCount)
    .sort((left, right) => left - right);

  return perSessionValues[0] ? Math.round(perSessionValues[0] * 100) / 100 : 0;
}

export function buildPackageAllocation(state: CRMState) {
  const usedUnitsByPurchaseId: Record<string, number> = Object.fromEntries(
    state.packagePurchases.map((purchase) => [purchase.id, 0]),
  );
  const packageBySessionId: Record<string, string> = {};
  const uncoveredSessionIds: string[] = [];
  const uncoveredAmountBySessionId: Record<string, number> = {};

  const purchases = state.packagePurchases
    .map((purchase) => {
      const template = getPackageTemplate(state, purchase.templateId);
      return template ? { purchase, template } : null;
    })
    .filter(
      (
        item,
      ): item is {
        purchase: PackagePurchase;
        template: PackageTemplate;
      } => Boolean(item),
    )
    .sort(comparePackageCoverageOrder);

  const completedSessions = [...state.sessions]
    .filter((session) => session.status === "completed")
    .sort(compareCompletedSessionCoverageOrder);

  completedSessions.forEach((session) => {
    const eligiblePurchases = purchases.filter(({ purchase, template }) => {
      const usedUnits = usedUnitsByPurchaseId[purchase.id] ?? 0;
      return (
        usedUnits < purchase.totalUnits &&
        canPurchaseCoverSession(purchase, template, session)
      );
    });

    const preferredPurchase =
      session.packagePurchaseId &&
      eligiblePurchases.find(({ purchase }) => purchase.id === session.packagePurchaseId);
    const selectedPurchase = preferredPurchase ?? eligiblePurchases[0];

    if (!selectedPurchase) {
      uncoveredSessionIds.push(session.id);
      uncoveredAmountBySessionId[session.id] = getSessionUnitPrice(state, session.kind);
      return;
    }

    packageBySessionId[session.id] = selectedPurchase.purchase.id;
    usedUnitsByPurchaseId[selectedPurchase.purchase.id] =
      (usedUnitsByPurchaseId[selectedPurchase.purchase.id] ?? 0) + 1;
  });

  return {
    packageBySessionId,
    usedUnitsByPurchaseId,
    uncoveredSessionIds,
    uncoveredAmountBySessionId,
  };
}

export function getLeadCounts(state: CRMState) {
  return state.leads.reduce<Record<string, number>>((acc, lead) => {
    if (lead.status === "converted") {
      return acc;
    }

    acc[lead.status] = (acc[lead.status] ?? 0) + 1;
    return acc;
  }, {});
}

export function getConvertedClientsWithFirstSessionBookedCount(state: CRMState) {
  return state.clients.filter((client) => {
    const hasConvertedLeadOrigin = Boolean(
      client.originLeadId ||
        state.leads.some(
          (lead) =>
            lead.status === "converted" &&
            lead.email.toLowerCase() === client.email.toLowerCase(),
        ),
    );

    if (!hasConvertedLeadOrigin) {
      return false;
    }

    const firstSession = getClientSessions(state, client.id)[0];
    return Boolean(
      firstSession &&
        (firstSession.status === "planned" || firstSession.status === "in-progress"),
    );
  }).length;
}

export function getClientSessions(state: CRMState, clientId: string) {
  return state.sessions
    .filter((session) => session.clientIds.includes(clientId))
    .sort(compareSessionStart);
}

export function getClientUpcomingSession(state: CRMState, clientId: string) {
  const schedulableStatuses = new Set(["planned", "in-progress"]);
  const sessions = state.sessions.filter(
    (session) =>
      session.clientIds.includes(clientId) && schedulableStatuses.has(session.status),
  );

  const scheduledSession = [...sessions]
    .filter((session) => Boolean(session.startAt))
    .sort(compareSessionStart)[0];

  if (scheduledSession) {
    return scheduledSession;
  }

  return sessions.find((session) => !session.startAt);
}

export function getClientPurchases(state: CRMState, clientId: string) {
  return state.packagePurchases
    .filter((purchase) => getPurchaseLinkedClientIds(purchase).includes(clientId))
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

export function getActivePackagePurchase(state: CRMState, clientId: string) {
  const now = new Date().toISOString();
  const purchases = getClientPurchases(state, clientId);

  return (
    purchases.find(
      (purchase) => getRemainingUnits(purchase) > 0 && (!purchase.expiresAt || purchase.expiresAt >= now),
    ) ?? purchases.find((purchase) => getRemainingUnits(purchase) > 0)
  );
}

export function getClientAssessments(state: CRMState, clientId: string) {
  return state.bodyAssessments
    .filter((assessment) => assessment.clientId === clientId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export function getClientWorkoutPlans(state: CRMState, clientId: string) {
  return state.workoutPlans
    .filter((plan) => plan.clientId === clientId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getClientNutritionPlans(state: CRMState, clientId: string) {
  return state.nutritionPlans
    .filter((plan) => plan.clientId === clientId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getClientThreads(state: CRMState, clientId: string) {
  return state.emailThreads
    .filter((thread) => thread.clientId === clientId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getClientMessages(state: CRMState, clientId: string) {
  return state.emailMessages
    .filter((message) => message.clientId === clientId)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function getClientDrafts(state: CRMState, clientId: string) {
  return state.aiDrafts
    .filter((draft) => draft.clientId === clientId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getClientOutstandingInvoices(state: CRMState, clientId: string) {
  return state.invoiceRecords
    .filter(
      (invoice) => invoice.clientId === clientId && getInvoiceOutstandingAmount(state, invoice) > 0,
    )
    .sort((a, b) => {
      const leftKey = a.issuedAt || a.dueAt;
      const rightKey = b.issuedAt || b.dueAt;
      return rightKey.localeCompare(leftKey);
    });
}

export function getClientOutstandingRevenue(state: CRMState, clientId: string) {
  return getClientOutstandingInvoices(state, clientId).reduce(
    (sum, invoice) => sum + getInvoiceOutstandingAmount(state, invoice),
    0,
  );
}

export function getSessionBundle(state: CRMState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return null;

  const plannedWorkout = state.plannedWorkouts.find(
    (item) => item.id === session.plannedWorkoutId,
  );
  const sessionWorkout = state.sessionWorkouts.find(
    (item) => item.id === session.sessionWorkoutId,
  );
  const client = getClient(state, session.primaryClientId);

  return { session, plannedWorkout, sessionWorkout, client };
}

export function getUpcomingSessions(state: CRMState, limit = 6) {
  return [...state.sessions]
    .filter(
      (session) =>
        (session.status === "planned" || session.status === "in-progress") &&
        Boolean(session.startAt),
    )
    .sort(compareSessionStart)
    .slice(0, limit);
}

export function getSessionsToday(state: CRMState, dateKey = getTodayDateKey()) {
  return state.sessions.filter(
    (session) => Boolean(session.startAt) && getLocalDateKey(session.startAt) === dateKey,
  );
}

export function getMonthlyRevenue(state: CRMState, monthKey = getCurrentMonthKey()) {
  return state.paymentRecords
    .filter((payment) => getLocalMonthKey(payment.paidAt) === monthKey)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getMonthlyRevenueByMethod(
  state: CRMState,
  method: CRMState["paymentRecords"][number]["method"],
  monthKey = getCurrentMonthKey(),
) {
  return state.paymentRecords
    .filter(
      (payment) =>
        getLocalMonthKey(payment.paidAt) === monthKey && payment.method === method,
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getInvoicePaidAmount(state: CRMState, invoiceId: string) {
  return state.paymentRecords
    .filter((payment) => payment.invoiceId === invoiceId)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getInvoiceOutstandingAmount(state: CRMState, invoice: InvoiceRecord) {
  return Math.max(invoice.amount - getInvoicePaidAmount(state, invoice.id), 0);
}

export function getOutstandingRevenue(state: CRMState) {
  return state.invoiceRecords.reduce((sum, invoice) => {
    return sum + getInvoiceOutstandingAmount(state, invoice);
  }, 0);
}

export function getPackageLiability(state: CRMState) {
  return state.packagePurchases.reduce((sum, purchase) => {
    const remainingUnits = Math.max(purchase.totalUnits - purchase.usedUnits, 0);
    const proportionalValue = (purchase.price / purchase.totalUnits) * remainingUnits;
    return sum + proportionalValue;
  }, 0);
}

export function getPackageTemplate(state: CRMState, templateId: string) {
  return state.packageTemplates.find((template) => template.id === templateId);
}

export function getRemainingUnits(purchase: CRMState["packagePurchases"][number]) {
  return Math.max(purchase.totalUnits - purchase.usedUnits, 0);
}

export function getSessionCompletion(sessionWorkout?: SessionWorkout | null) {
  if (!sessionWorkout) {
    return { completedSets: 0, totalSets: 0, completionRate: 0 };
  }

  const allSets = sessionWorkout.exercises.flatMap((exercise) => exercise.sets);
  const completedSets = allSets.filter((set) => set.completed).length;
  const totalSets = allSets.length;

  return {
    completedSets,
    totalSets,
    completionRate: totalSets === 0 ? 0 : completedSets / totalSets,
  };
}

export function summarizeExerciseAdjustments(exercises: SessionExercise[]) {
  return exercises.reduce(
    (acc, exercise) => {
      if (exercise.status === "modified") acc.modified += 1;
      if (exercise.status === "added") acc.added += 1;
      if (exercise.status === "skipped") acc.skipped += 1;
      return acc;
    },
    { modified: 0, added: 0, skipped: 0 },
  );
}
