"use client";

import { useState } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  DataLabel,
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/crm-ui";
import {
  getSessionBundle,
  getSessionCompletion,
  summarizeExerciseAdjustments,
} from "@/lib/selectors";
import { getDateInputValueFromIso, getTimeInputValueFromIso } from "@/lib/date";
import { AIDraft, Session, TrainingLocation } from "@/lib/types";
import { PageLead } from "@/components/screens/shared";

function durationInputFromSession(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) {
    return "60";
  }

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "60";
  }

  const diff = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  return String(diff);
}

function DraftEditor({
  title,
  draftId,
  subject,
  body,
  internalNote,
  onChange,
  onSaveAndCopy,
  actionLabel,
  actionDetail,
}: {
  title: string;
  draftId: string;
  subject: string;
  body: string;
  internalNote?: string;
  onChange: (draftId: string, patch: { subject?: string; body?: string; internalNote?: string }) => void;
  onSaveAndCopy: (draft: { draftId: string; body: string }) => void;
  actionLabel: string;
  actionDetail: string;
}) {
  const { t } = useLocaleContext();

  return (
    <div className="space-y-4 rounded-[24px] border border-[color:var(--line-soft)] bg-white/60 p-4">
      <p className="font-semibold text-[color:var(--ink)]">{title}</p>
      <DataLabel label={t("workout.draftSubject")}>
        <input
          value={subject}
          onChange={(event) => onChange(draftId, { subject: event.target.value })}
          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
        />
      </DataLabel>
      <DataLabel label={t("workout.draftBody")}>
        <textarea
          value={body}
          onChange={(event) => onChange(draftId, { body: event.target.value })}
          rows={8}
          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
        />
      </DataLabel>
      <DataLabel label={t("workout.draftPreview")}>
        <div className="whitespace-pre-wrap rounded-2xl border border-[color:var(--line-soft)] bg-[color:var(--sand-2)]/45 px-4 py-4 text-sm leading-7 text-[color:var(--ink)]">
          {body}
        </div>
      </DataLabel>
      <DataLabel label={t("workout.internalNote")}>
        <textarea
          value={internalNote ?? ""}
          onChange={(event) => onChange(draftId, { internalNote: event.target.value })}
          rows={4}
          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
        />
      </DataLabel>
      <p className="text-xs leading-5 text-[color:var(--muted-ink)]">{actionDetail}</p>
      <button
        type="button"
        onClick={() => onSaveAndCopy({ draftId, body })}
        className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function SessionScheduleCard({
  session,
  trainingLocations,
  onSave,
}: {
  session: Session;
  trainingLocations: TrainingLocation[];
  onSave: (args: {
    sessionDate: string;
    startTime: string;
    durationMinutes: number;
    location: string;
  }) => void;
}) {
  const { t, locale, formatDate } = useLocaleContext();
  const [sessionDate, setSessionDate] = useState(() =>
    getDateInputValueFromIso(session.startAt),
  );
  const [startTime, setStartTime] = useState(() =>
    getTimeInputValueFromIso(session.startAt),
  );
  const [durationMinutes, setDurationMinutes] = useState(() =>
    durationInputFromSession(session.startAt, session.endAt),
  );
  const [location, setLocation] = useState(() => session.location || "");
  const schedulePending = !session.startAt || !session.location;

  return (
    <SectionCard
      title={schedulePending ? t("workout.scheduleSession") : t("workout.scheduleDetails")}
      subtitle={
        schedulePending
          ? t("workout.schedulePendingHint")
          : `${formatDate(session.startAt)} / ${session.location}`
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <DataLabel label={t("fields.sessionDate")}>
          <input
            type="date"
            lang={locale === "et" ? "et-EE" : "en-GB"}
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
          />
        </DataLabel>
        <DataLabel label={t("fields.startTime")}>
          <input
            type="time"
            lang={locale === "et" ? "et-EE" : "en-GB"}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
          />
        </DataLabel>
        <DataLabel label={t("fields.durationMinutes")}>
          <input
            type="number"
            min="15"
            step="15"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
          />
        </DataLabel>
        <DataLabel label={t("fields.location")}>
          <input
            list={`session-location-${session.id}`}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
          />
          <datalist id={`session-location-${session.id}`}>
            {trainingLocations.map((trainingLocation) => (
              <option key={trainingLocation.id} value={trainingLocation.name} />
            ))}
          </datalist>
        </DataLabel>
      </div>

      <button
        type="button"
        onClick={() => {
          const parsedDuration = Number(durationMinutes);
          if (
            !sessionDate ||
            !startTime ||
            !location.trim() ||
            !Number.isFinite(parsedDuration) ||
            parsedDuration <= 0
          ) {
            return;
          }

          onSave({
            sessionDate,
            startTime,
            durationMinutes: parsedDuration,
            location,
          });
        }}
        className="mt-4 rounded-full bg-[color:var(--clay)] px-4 py-2 text-sm font-semibold text-white"
      >
        {t("common.save")}
      </button>
    </SectionCard>
  );
}

export function WorkoutSessionScreen({
  clientId,
  sessionId,
}: {
  clientId: string;
  sessionId: string;
}) {
  const {
    state,
    updateSessionNote,
    updateSessionSchedule,
    updateExerciseNote,
    updateSet,
    toggleExerciseState,
    addExercise,
    regenerateSessionWorkout,
    completeSession,
    updateDraft,
    sendDraftToTimeline,
  } = useCRM();
  const { t, formatDate } = useLocaleContext();
  const [newExerciseName, setNewExerciseName] = useState("");
  const [showReworkPanel, setShowReworkPanel] = useState(false);
  const [reworkInstructions, setReworkInstructions] = useState("");
  const [isReworking, setIsReworking] = useState(false);
  const [isCompletingSession, setIsCompletingSession] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const bundle = getSessionBundle(state, sessionId);
  if (!bundle || !bundle.client || bundle.client.id !== clientId) {
    return (
      <EmptyState
        title={t("workout.missingSessionTitle")}
        body={t("workout.missingSessionBody")}
      />
    );
  }

  const { client, plannedWorkout, session, sessionWorkout } = bundle;
  if (!sessionWorkout) {
    return (
      <EmptyState
        title={t("workout.missingWorkoutTitle")}
        body={t("workout.missingWorkoutBody")}
      />
    );
  }

  const completion = getSessionCompletion(sessionWorkout);
  const adjustments = summarizeExerciseAdjustments(sessionWorkout.exercises);
  const summaryDraft = [...state.aiDrafts]
    .filter((draft) => draft.sessionId === sessionId && draft.type === "workout-summary")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const subtitleMeta = [
    session.startAt ? formatDate(session.startAt) : t("common.noDateYet"),
    session.location || `${t("fields.location")}: ${t("common.none")}`,
  ];

  async function handleReworkWorkout() {
    if (!reworkInstructions.trim()) {
      return;
    }

    setIsReworking(true);
    try {
      await regenerateSessionWorkout({
        sessionId: session.id,
        instructions: reworkInstructions.trim(),
      });
      setReworkInstructions("");
      setShowReworkPanel(false);
    } finally {
      setIsReworking(false);
    }
  }

  async function handleCompleteSession() {
    setIsCompletingSession(true);
    try {
      await completeSession(session.id);
    } finally {
      setIsCompletingSession(false);
    }
  }

  async function copyTextToClipboard(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const tempTextArea = document.createElement("textarea");
    tempTextArea.value = value;
    tempTextArea.setAttribute("readonly", "true");
    tempTextArea.style.position = "absolute";
    tempTextArea.style.left = "-9999px";
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand("copy");
    document.body.removeChild(tempTextArea);
  }

  async function handleSaveAndCopyDraft({
    draftId,
    body,
  }: {
    draftId: string;
    body: string;
  }) {
    sendDraftToTimeline(draftId);
    await copyTextToClipboard(body);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 2200);
  }

  return (
    <div className="space-y-6">
      <PageLead
        eyebrow={t("workout.title")}
        title={session.title}
        subtitle={
          <span>
            <strong className="font-semibold text-[color:var(--ink)]">{client.fullName}</strong>
            <span>{` / ${subtitleMeta.join(" / ")}`}</span>
          </span>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label={t("workout.live")}
          value={`${completion.completedSets}/${completion.totalSets}`}
          detail={t("workout.completedSetsDetail")}
        />
        <StatCard
          label={t("workout.modified")}
          value={String(adjustments.modified)}
          detail={t("workout.modifiedExercisesDetail")}
        />
        <StatCard
          label={t("workout.added")}
          value={String(adjustments.added)}
          detail={t("workout.addedExercisesDetail")}
        />
        <StatCard
          label={t("workout.skipped")}
          value={String(adjustments.skipped)}
          detail={t("workout.skippedExercisesDetail")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <SectionCard
            title={t("workout.title")}
            subtitle={plannedWorkout?.objective ?? session.title}
            help={t("help.plannedActual")}
            aside={
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowReworkPanel((previous) => !previous)}
                  title={t("workout.reworkToggleTitle")}
                  aria-label={t("workout.reworkToggleTitle")}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--line-soft)] bg-white/75 text-lg"
                >
                  🪄
                </button>
                <button
                  type="button"
                  onClick={() => void handleCompleteSession()}
                  disabled={isCompletingSession || session.status === "completed"}
                  className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCompletingSession ? t("workout.completing") : t("workout.completeSession")}
                </button>
              </div>
            }
          >
            {showReworkPanel ? (
              <div className="mb-5 rounded-[26px] border border-[color:var(--line-soft)] bg-white/65 p-5">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">
                    {t("workout.reworkPanelTitle")}
                  </p>
                  <p className="text-sm text-[color:var(--muted-ink)]">
                    {t("workout.reworkPanelSubtitle")}
                  </p>
                </div>
                <div className="mt-4">
                  <DataLabel label={t("workout.reworkInputLabel")}>
                    <textarea
                      value={reworkInstructions}
                      onChange={(event) => setReworkInstructions(event.target.value)}
                      placeholder={t("workout.reworkPlaceholder")}
                      rows={4}
                      className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
                    />
                  </DataLabel>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleReworkWorkout()}
                    disabled={isReworking || !reworkInstructions.trim()}
                    className="rounded-full bg-[color:var(--clay)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isReworking ? t("workout.reworking") : t("workout.reworkAction")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReworkPanel(false)}
                    className="rounded-full bg-[color:var(--sand-2)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            ) : null}

            <p className="mb-5 text-sm text-[color:var(--muted-ink)]">
              {t("workout.autoNextHint")}
            </p>

            <div className="space-y-4">
              {sessionWorkout.exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="rounded-[26px] border border-[color:var(--line-soft)] bg-white/70 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-lg font-semibold text-[color:var(--ink)]">{exercise.name}</p>
                        <StatusBadge status={exercise.status} />
                      </div>
                      <p className="mt-1 text-sm text-[color:var(--muted-ink)]">
                        {plannedWorkout?.exercises.find((planned) => planned.id === exercise.plannedExerciseId)?.note ??
                          t("workout.liveAdjustmentsAllowed")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleExerciseState(
                          session.id,
                          exercise.id,
                          exercise.status === "skipped" ? "planned" : "skipped",
                        )
                      }
                      className="rounded-full bg-[color:var(--sand-2)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                    >
                      {exercise.status === "skipped" ? t("workout.restore") : t("workout.skip")}
                    </button>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-[color:var(--muted-ink)]">
                          <th className="pb-3 pr-3">{t("workout.setColumn")}</th>
                          <th className="pb-3 pr-3">{t("workout.planned")}</th>
                          <th className="pb-3 pr-3">{t("workout.actualReps")}</th>
                          <th className="pb-3 pr-3">{t("workout.actualWeight")}</th>
                          <th className="pb-3 pr-3">{t("workout.rpe")}</th>
                          <th className="pb-3">{t("workout.setDone")}</th>
                        </tr>
                      </thead>
                      <tbody className="space-y-2">
                        {exercise.sets.map((set) => (
                          <tr key={set.id} className="border-t border-[color:var(--line-soft)]">
                            <td className="py-3 pr-3 font-semibold text-[color:var(--ink)]">{set.label}</td>
                            <td className="py-3 pr-3 text-[color:var(--muted-ink)]">
                              {set.targetReps}
                              {set.targetWeightKg ? ` @ ${set.targetWeightKg}kg` : ""}
                            </td>
                            <td className="py-3 pr-3">
                              <input
                                value={set.actualReps}
                                onChange={(event) =>
                                  updateSet(session.id, exercise.id, set.id, {
                                    actualReps: event.target.value,
                                  })
                                }
                                className="w-24 rounded-xl border border-[color:var(--line-soft)] bg-white px-3 py-2 outline-none"
                              />
                            </td>
                            <td className="py-3 pr-3">
                              <input
                                value={set.actualWeightKg ?? ""}
                                onChange={(event) =>
                                  updateSet(session.id, exercise.id, set.id, {
                                    actualWeightKg:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                                className="w-24 rounded-xl border border-[color:var(--line-soft)] bg-white px-3 py-2 outline-none"
                              />
                            </td>
                            <td className="py-3 pr-3">
                              <input
                                value={set.rpe ?? ""}
                                onChange={(event) =>
                                  updateSet(session.id, exercise.id, set.id, {
                                    rpe:
                                      event.target.value === ""
                                        ? undefined
                                        : Number(event.target.value),
                                  })
                                }
                                className="w-20 rounded-xl border border-[color:var(--line-soft)] bg-white px-3 py-2 outline-none"
                              />
                            </td>
                            <td className="py-3">
                              <input
                                checked={set.completed}
                                onChange={(event) =>
                                  updateSet(session.id, exercise.id, set.id, {
                                    completed: event.target.checked,
                                  })
                                }
                                type="checkbox"
                                className="h-5 w-5 rounded"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4">
                    <DataLabel label={t("workout.exerciseNote")}>
                      <textarea
                        value={exercise.note ?? ""}
                        onChange={(event) =>
                          updateExerciseNote(session.id, exercise.id, event.target.value)
                        }
                        rows={3}
                        className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
                      />
                    </DataLabel>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                placeholder={t("workout.addLiveExercisePlaceholder")}
                className="rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newExerciseName.trim()) return;
                  addExercise(session.id, newExerciseName.trim());
                  setNewExerciseName("");
                }}
                className="rounded-2xl bg-[color:var(--clay)] px-4 py-3 text-sm font-semibold text-white"
              >
                {t("workout.addExercise")}
              </button>
            </div>
          </SectionCard>

          <SectionCard title={t("workout.coachNotes")}>
            <div className="grid gap-4 md:grid-cols-2">
              <DataLabel label={t("workout.coachNotes")}>
                <textarea
                  value={sessionWorkout.coachNote}
                  onChange={(event) =>
                    updateSessionNote(session.id, "coachNote", event.target.value)
                  }
                  rows={6}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>
              <DataLabel label={t("workout.athleteRecap")}>
                <textarea
                  value={sessionWorkout.athleteFacingNote}
                  onChange={(event) =>
                    updateSessionNote(session.id, "athleteFacingNote", event.target.value)
                  }
                  rows={6}
                  className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
                />
              </DataLabel>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SessionScheduleCard
            key={`${session.id}-${session.startAt}-${session.endAt}-${session.location}`}
            session={session}
            trainingLocations={state.trainingLocations}
            onSave={(schedule) =>
              updateSessionSchedule({
                sessionId: session.id,
                ...schedule,
              })
            }
          />

          {summaryDraft ? (
            <SectionCard
              title={t("workout.summaryCardTitle")}
              subtitle={t("workout.summaryCardSubtitle")}
              help={t("help.aiDrafts")}
            >
              <DraftEditor
                title={summaryDraft.title}
                draftId={summaryDraft.id}
                subject={summaryDraft.subject}
                body={summaryDraft.body}
                internalNote={summaryDraft.internalNote}
                onChange={(draftId, patch) =>
                  updateDraft(draftId, patch as Partial<AIDraft>)
                }
                onSaveAndCopy={handleSaveAndCopyDraft}
                actionLabel={
                  copyState === "copied"
                    ? t("workout.saveAndCopySuccess")
                    : t("workout.saveAndCopy")
                }
                actionDetail={t("workout.saveAndCopyHint")}
              />
            </SectionCard>
          ) : null}

          {!summaryDraft ? (
            <SectionCard
              title={t("workout.summaryCardTitle")}
              subtitle={t("workout.summaryPendingSubtitle")}
              help={t("help.aiDrafts")}
            >
              <EmptyState
                title={t("workout.summaryPendingTitle")}
                body={t("workout.summaryPendingBody")}
              />
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
