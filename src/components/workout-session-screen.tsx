"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useCRM, useLocaleContext } from "@/components/app-providers";
import {
  DataLabel,
  EmptyState,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/crm-ui";
import {
  getClientAssessments,
  getSessionBundle,
  getSessionCompletion,
  summarizeExerciseAdjustments,
} from "@/lib/selectors";
import { PageLead } from "@/components/screens/shared";

type DraftKind = "workout-summary" | "next-session";

function DraftEditor({
  title,
  draftId,
  subject,
  body,
  internalNote,
  onChange,
  onSend,
  sendLabel,
}: {
  title: string;
  draftId: string;
  subject: string;
  body: string;
  internalNote?: string;
  onChange: (draftId: string, patch: { subject?: string; body?: string; internalNote?: string }) => void;
  onSend: (draftId: string) => void;
  sendLabel: string;
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
      <DataLabel label={t("workout.internalNote")}>
        <textarea
          value={internalNote ?? ""}
          onChange={(event) => onChange(draftId, { internalNote: event.target.value })}
          rows={4}
          className="w-full rounded-2xl border border-[color:var(--line-soft)] bg-white/90 px-4 py-3 text-sm leading-6 outline-none"
        />
      </DataLabel>
      <button
        type="button"
        onClick={() => onSend(draftId)}
        className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white"
      >
        {sendLabel}
      </button>
    </div>
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
    updateExerciseNote,
    updateSet,
    toggleExerciseState,
    addExercise,
    completeSession,
    upsertDraft,
    updateDraft,
    sendDraftToTimeline,
  } = useCRM();
  const { t, locale, formatDate } = useLocaleContext();
  const [newExerciseName, setNewExerciseName] = useState("");
  const [isPending, startTransition] = useTransition();

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
  const assessments = getClientAssessments(state, client.id);
  const summaryDraft = [...state.aiDrafts]
    .filter((draft) => draft.sessionId === sessionId && draft.type === "workout-summary")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const nextDraft = [...state.aiDrafts]
    .filter((draft) => draft.sessionId === sessionId && draft.type === "next-session")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  async function generateDraft(kind: DraftKind) {
    const endpoint =
      kind === "workout-summary" ? "/api/ai/workout-summary" : "/api/ai/next-session";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale,
        client,
        session,
        plannedWorkout,
        sessionWorkout,
        assessments,
      }),
    });

    const payload = (await response.json()) as { draft: Parameters<typeof upsertDraft>[0] };
    startTransition(() => upsertDraft(payload.draft));
  }

  return (
    <div className="space-y-6">
      <PageLead
        eyebrow={t("workout.title")}
        title={session.title}
        subtitle={`${client.fullName} / ${formatDate(session.startAt)} / ${session.location}`}
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
                  onClick={() => completeSession(session.id)}
                  className="rounded-full bg-[color:var(--ink)] px-4 py-2 text-sm font-semibold text-white"
                >
                  {t("workout.completeSession")}
                </button>
                <Link
                  href={`/clients/${client.id}`}
                  className="rounded-full bg-[color:var(--sand-2)] px-4 py-2 text-sm font-semibold text-[color:var(--ink)]"
                >
                  {client.fullName}
                </Link>
              </div>
            }
          >
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
          <SectionCard title={t("workout.aiTools")} help={t("help.aiDrafts")}>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => void generateDraft("workout-summary")}
                className="rounded-[22px] bg-[color:var(--ink)] px-4 py-4 text-sm font-semibold text-white"
              >
                {isPending ? "..." : t("workout.recapDraft")}
              </button>
              <button
                type="button"
                onClick={() => void generateDraft("next-session")}
                className="rounded-[22px] bg-[color:var(--clay)] px-4 py-4 text-sm font-semibold text-white"
              >
                {isPending ? "..." : t("workout.nextDraft")}
              </button>
            </div>
          </SectionCard>

          {summaryDraft ? (
            <DraftEditor
              title={summaryDraft.title}
              draftId={summaryDraft.id}
              subject={summaryDraft.subject}
              body={summaryDraft.body}
              internalNote={summaryDraft.internalNote}
              onChange={(draftId, patch) => updateDraft(draftId, patch)}
              onSend={(draftId) => sendDraftToTimeline(draftId)}
              sendLabel={t("workout.emailLog")}
            />
          ) : null}

          {nextDraft ? (
            <DraftEditor
              title={nextDraft.title}
              draftId={nextDraft.id}
              subject={nextDraft.subject}
              body={nextDraft.body}
              internalNote={nextDraft.internalNote}
              onChange={(draftId, patch) => updateDraft(draftId, patch)}
              onSend={(draftId) => sendDraftToTimeline(draftId)}
              sendLabel={t("workout.emailLog")}
            />
          ) : null}

          {!summaryDraft && !nextDraft ? (
            <EmptyState title={t("common.none")} body={t("workout.emptyDraft")} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
