import { CRMState, SessionExercise, SessionWorkout } from "@/lib/types";

export function getClient(state: CRMState, clientId: string) {
  return state.clients.find((client) => client.id === clientId);
}

export function getPurchaseLinkedClientIds(
  purchase: CRMState["packagePurchases"][number],
) {
  return [...new Set([purchase.clientId, ...(purchase.sharedClientIds ?? [])])];
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
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function getClientUpcomingSession(state: CRMState, clientId: string) {
  return getClientSessions(state, clientId).find(
    (session) => session.status === "planned" || session.status === "in-progress",
  );
}

export function getClientPurchases(state: CRMState, clientId: string) {
  return state.packagePurchases
    .filter((purchase) => getPurchaseLinkedClientIds(purchase).includes(clientId))
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
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
    .filter((session) => session.status === "planned" || session.status === "in-progress")
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, limit);
}

export function getSessionsToday(state: CRMState, datePrefix = "2026-03-24") {
  return state.sessions.filter((session) => session.startAt.startsWith(datePrefix));
}

export function getMonthlyRevenue(state: CRMState, monthPrefix = "2026-03") {
  return state.paymentRecords
    .filter((payment) => payment.paidAt.startsWith(monthPrefix))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getMonthlyRevenueByMethod(
  state: CRMState,
  method: CRMState["paymentRecords"][number]["method"],
  monthPrefix = "2026-03",
) {
  return state.paymentRecords
    .filter((payment) => payment.paidAt.startsWith(monthPrefix) && payment.method === method)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function getOutstandingRevenue(state: CRMState) {
  return state.invoiceRecords.reduce((sum, invoice) => {
    const paid = state.paymentRecords
      .filter((payment) => payment.invoiceId === invoice.id)
      .reduce((paymentSum, payment) => paymentSum + payment.amount, 0);

    return sum + Math.max(invoice.amount - paid, 0);
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
