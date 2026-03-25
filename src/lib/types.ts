export type Locale = "en" | "et";
export type Currency = "EUR";
export type LeadStatus = "new" | "contacted" | "trial-booked" | "converted";
export type ConsentState = "pending" | "signed" | "declined";
export type SessionStatus =
  | "planned"
  | "in-progress"
  | "completed"
  | "cancelled"
  | "no-show";
export type PaymentStatus = "paid" | "partial" | "pending" | "overdue";
export type SessionKind = "solo" | "duo" | "group";
export type PlanStatus = "draft" | "active" | "archived";
export type DraftType =
  | "workout-summary"
  | "next-session"
  | "workout-plan"
  | "nutrition-plan"
  | "email";
export type DraftStatus = "draft" | "reviewed" | "sent";
export type CalendarSyncState = "synced" | "pending" | "manual";
export type ReminderStatus = "scheduled" | "sent" | "done";
export type SessionExerciseStatus =
  | "planned"
  | "completed"
  | "modified"
  | "added"
  | "skipped";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone: string;
}

export interface Lead {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  goal: string;
  nextStep: string;
  preferredLanguage: Locale;
  createdAt: string;
  lastContactAt: string;
  notes: string;
}

export interface CreateLeadInput {
  fullName: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  goal: string;
  nextStep: string;
  preferredLanguage: Locale;
  notes: string;
}

export interface HealthFlag {
  title: string;
  detail: string;
  severity: "info" | "attention";
}

export interface ClientProfile {
  id: string;
  originLeadId?: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  preferredLanguage: Locale;
  goals: string[];
  tags: string[];
  joinedAt: string;
  consentStatus: ConsentState;
  healthFlags: HealthFlag[];
  notes: string;
  ownerId: string;
  avatarHue: number;
}

export interface CreateClientInput {
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  preferredLanguage: Locale;
  goals: string[];
  tags: string[];
  consentStatus: ConsentState;
  notes: string;
  healthFlags: HealthFlag[];
}

export interface PackageTemplate {
  id: string;
  name: string;
  sessionCount: 1 | 3 | 7;
  tier: SessionKind;
  maxParticipants: number;
  durationMinutes: number;
  price: number;
  currency: Currency;
}

export interface PackagePurchase {
  id: string;
  clientId: string;
  templateId: string;
  purchasedAt: string;
  startsAt: string;
  expiresAt: string;
  totalUnits: number;
  usedUnits: number;
  price: number;
  paymentStatus: PaymentStatus;
  invoiceId: string;
  notes?: string;
}

export interface CreatePackagePurchaseInput {
  clientId: string;
  templateId: string;
  purchasedAt: string;
  startsAt: string;
  expiresAt: string;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  notes?: string;
}

export interface PlannedSet {
  id: string;
  label: string;
  reps: string;
  weightKg?: number;
  tempo?: string;
  rpe?: number;
  note?: string;
}

export interface PlannedExercise {
  id: string;
  exerciseId?: string;
  name: string;
  focus?: string;
  note?: string;
  sets: PlannedSet[];
}

export interface PlannedWorkout {
  id: string;
  clientId: string;
  sessionId: string;
  sourcePlanId?: string;
  title: string;
  objective: string;
  exercises: PlannedExercise[];
  createdAt: string;
}

export interface SetEntry {
  id: string;
  label: string;
  targetReps: string;
  actualReps: string;
  targetWeightKg?: number;
  actualWeightKg?: number;
  tempo?: string;
  rpe?: number;
  completed: boolean;
  note?: string;
}

export interface SessionExercise {
  id: string;
  plannedExerciseId?: string;
  exerciseId?: string;
  name: string;
  status: SessionExerciseStatus;
  note?: string;
  sets: SetEntry[];
}

export interface SessionWorkout {
  id: string;
  sessionId: string;
  title: string;
  status: "draft" | "live" | "completed";
  exercises: SessionExercise[];
  coachNote: string;
  athleteFacingNote: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  title: string;
  coachId: string;
  primaryClientId: string;
  clientIds: string[];
  kind: SessionKind;
  startAt: string;
  endAt: string;
  location: string;
  status: SessionStatus;
  packagePurchaseId?: string;
  plannedWorkoutId?: string;
  sessionWorkoutId?: string;
  reminderAt?: string;
  calendarSync: CalendarSyncState;
  note?: string;
}

export interface BodyMetric {
  id: string;
  label: string;
  unit: string;
  value: number;
}

export interface BodyMetricInput {
  label: string;
  unit: string;
  value: number;
}

export interface BodyAssessment {
  id: string;
  clientId: string;
  recordedAt: string;
  recordedBy: string;
  notes: string;
  metrics: BodyMetric[];
}

export interface CreateBodyAssessmentInput {
  clientId: string;
  recordedAt: string;
  notes: string;
  metrics: BodyMetricInput[];
}

export interface WorkoutPlan {
  id: string;
  clientId: string;
  title: string;
  status: PlanStatus;
  goal: string;
  focusAreas: string[];
  sessionPattern: string[];
  activeFrom: string;
  createdAt: string;
  updatedAt: string;
  origin: "coach" | "ai";
}

export interface NutritionPlan {
  id: string;
  clientId: string;
  title: string;
  status: PlanStatus;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  hydrationLiters: number;
  principles: string[];
  createdAt: string;
  updatedAt: string;
  origin: "coach" | "ai";
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  category: string;
  primaryUnit: "kg" | "bodyweight" | "minutes";
}

export interface EmailThread {
  id: string;
  clientId: string;
  subject: string;
  source: "outlook" | "crm";
  updatedAt: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  clientId: string;
  direction: "outbound" | "inbound";
  subject: string;
  body: string;
  sentAt: string;
}

export interface Reminder {
  id: string;
  clientId: string;
  sessionId?: string;
  title: string;
  dueAt: string;
  channel: "email" | "calendar";
  status: ReminderStatus;
}

export interface InvoiceRecord {
  id: string;
  clientId: string;
  packagePurchaseId: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  currency: Currency;
  paymentStatus: PaymentStatus;
}

export interface PaymentRecord {
  id: string;
  clientId: string;
  invoiceId: string;
  paidAt: string;
  amount: number;
  currency: Currency;
  method: string;
}

export interface ActivityEvent {
  id: string;
  actor: string;
  clientId?: string;
  type: string;
  detail: string;
  createdAt: string;
}

export interface AIDraft {
  id: string;
  type: DraftType;
  clientId: string;
  sessionId?: string;
  title: string;
  subject: string;
  body: string;
  internalNote?: string;
  locale: Locale;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  model: string;
  promptType: string;
  sources: string[];
}

export interface CRMState {
  users: User[];
  leads: Lead[];
  clients: ClientProfile[];
  packageTemplates: PackageTemplate[];
  packagePurchases: PackagePurchase[];
  sessions: Session[];
  plannedWorkouts: PlannedWorkout[];
  sessionWorkouts: SessionWorkout[];
  bodyAssessments: BodyAssessment[];
  workoutPlans: WorkoutPlan[];
  nutritionPlans: NutritionPlan[];
  exerciseLibrary: ExerciseLibraryItem[];
  emailThreads: EmailThread[];
  emailMessages: EmailMessage[];
  reminders: Reminder[];
  invoiceRecords: InvoiceRecord[];
  paymentRecords: PaymentRecord[];
  activityEvents: ActivityEvent[];
  aiDrafts: AIDraft[];
}

export interface IntegrationHealth {
  name: string;
  configured: boolean;
  state: "ready" | "pending";
  detail: string;
  envKeys: string[];
}
