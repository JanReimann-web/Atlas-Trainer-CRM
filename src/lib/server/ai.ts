import OpenAI from "openai";
import {
  AIDraft,
  BodyAssessment,
  ClientProfile,
  Locale,
  NutritionPlan,
  PlannedWorkout,
  Session,
  SessionKind,
  SessionWorkout,
  TrainingLocation,
  WorkoutExerciseInput,
  WorkoutPlan,
} from "@/lib/types";
import { summarizeExerciseAdjustments } from "@/lib/selectors";

type WorkoutSummaryInput = {
  locale: Locale;
  client: ClientProfile;
  session: Session;
  plannedWorkout?: PlannedWorkout | null;
  sessionWorkout?: SessionWorkout | null;
  assessments: BodyAssessment[];
};

type AdaptivePlanInput = {
  locale: Locale;
  client: ClientProfile;
  currentWorkoutPlan?: WorkoutPlan | null;
  recentAssessments: BodyAssessment[];
  recentSessions: Session[];
  kind: "workout" | "nutrition";
};

type NutritionPlanInput = {
  locale: Locale;
  client: ClientProfile;
  currentNutritionPlan?: NutritionPlan | null;
  recentAssessments: BodyAssessment[];
  recentSessions: Session[];
};

type FirstWorkoutInput = {
  locale: Locale;
  client: ClientProfile;
  recentAssessments: BodyAssessment[];
  recentSessions: Session[];
  trainingLocations?: TrainingLocation[];
};

type GeneratedFirstWorkout = {
  planTitle: string;
  planGoal: string;
  focusAreas: string[];
  sessionPattern: string[];
  sessionTitle: string;
  sessionObjective: string;
  sessionKind: SessionKind;
  location: string;
  coachNote: string;
  sessionNote: string;
  exercises: WorkoutExerciseInput[];
};

type DraftFields = Pick<AIDraft, "title" | "subject" | "body" | "internalNote">;
type GeneratedNutritionPlan = Pick<
  NutritionPlan,
  | "title"
  | "calories"
  | "proteinGrams"
  | "carbsGrams"
  | "fatsGrams"
  | "hydrationLiters"
  | "principles"
  | "breakfastSharePercent"
  | "lunchSharePercent"
  | "dinnerSharePercent"
  | "coachRecommendation"
>;

let cachedOpenAIClient: OpenAI | null | undefined;

function nowIso() {
  return new Date().toISOString();
}

function baseDraft(
  type: AIDraft["type"],
  locale: Locale,
  clientId: string,
  sessionId: string | undefined,
  title: string,
  subject: string,
  body: string,
  internalNote: string,
  promptType: string,
  sources: string[],
  model = "fallback-draft-builder",
): AIDraft {
  const timestamp = nowIso();

  return {
    id: `draft-${crypto.randomUUID()}`,
    type,
    clientId,
    sessionId,
    title,
    subject,
    body,
    internalNote,
    locale,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
    model,
    promptType,
    sources,
  };
}

function getLatestAssessment(assessments: BodyAssessment[]) {
  return [...assessments].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
}

function getOpenAIModel() {
  const model = process.env.OPENAI_MODEL?.trim();
  return model && model.length > 0 ? model : null;
}

function getOpenAIClient() {
  if (cachedOpenAIClient !== undefined) {
    return cachedOpenAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  cachedOpenAIClient = apiKey ? new OpenAI({ apiKey }) : null;
  return cachedOpenAIClient;
}

function safeJsonStringify(value: unknown) {
  return JSON.stringify(
    value,
    (_, nestedValue) => (nestedValue === undefined ? null : nestedValue),
    2,
  );
}

function parseDraftFields(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<DraftFields>;
      if (
        typeof parsed.title === "string" &&
        typeof parsed.subject === "string" &&
        typeof parsed.body === "string"
      ) {
        return {
          title: parsed.title.trim(),
          subject: parsed.subject.trim(),
          body: parsed.body.trim(),
          internalNote:
            typeof parsed.internalNote === "string" ? parsed.internalNote.trim() : "",
        } satisfies DraftFields;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function parseNutritionPlanFields(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<GeneratedNutritionPlan>;
      if (
        typeof parsed.title !== "string" ||
        typeof parsed.calories !== "number" ||
        typeof parsed.proteinGrams !== "number" ||
        typeof parsed.carbsGrams !== "number" ||
        typeof parsed.fatsGrams !== "number" ||
        typeof parsed.hydrationLiters !== "number" ||
        !Array.isArray(parsed.principles) ||
        typeof parsed.breakfastSharePercent !== "number" ||
        typeof parsed.lunchSharePercent !== "number" ||
        typeof parsed.dinnerSharePercent !== "number" ||
        typeof parsed.coachRecommendation !== "string"
      ) {
        continue;
      }

      const principles = parsed.principles
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);

      if (principles.length === 0) {
        continue;
      }

      return {
        title: parsed.title.trim(),
        calories: Math.max(1200, Math.round(parsed.calories)),
        proteinGrams: Math.max(80, Math.round(parsed.proteinGrams)),
        carbsGrams: Math.max(80, Math.round(parsed.carbsGrams)),
        fatsGrams: Math.max(35, Math.round(parsed.fatsGrams)),
        hydrationLiters: Math.max(1.5, Math.round(parsed.hydrationLiters * 10) / 10),
        principles,
        breakfastSharePercent: Math.round(parsed.breakfastSharePercent),
        lunchSharePercent: Math.round(parsed.lunchSharePercent),
        dinnerSharePercent: Math.round(parsed.dinnerSharePercent),
        coachRecommendation: parsed.coachRecommendation.trim(),
      } satisfies GeneratedNutritionPlan;
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeWorkoutExerciseInput(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawExercise = value as Record<string, unknown>;
  const name = typeof rawExercise.name === "string" ? rawExercise.name.trim() : "";
  if (!name) {
    return null;
  }

  const sets: WorkoutExerciseInput["sets"] = Array.isArray(rawExercise.sets)
    ? rawExercise.sets
        .map<WorkoutExerciseInput["sets"][number] | null>((setValue, index) => {
          if (!setValue || typeof setValue !== "object") {
            return null;
          }

          const rawSet = setValue as Record<string, unknown>;
          const reps = typeof rawSet.reps === "string" ? rawSet.reps.trim() : "";
          if (!reps) {
            return null;
          }

          return {
            label:
              typeof rawSet.label === "string" && rawSet.label.trim()
                ? rawSet.label.trim()
                : String(index + 1),
            reps,
            weightKg:
              typeof rawSet.weightKg === "number" && Number.isFinite(rawSet.weightKg)
                ? rawSet.weightKg
                : undefined,
            tempo:
              typeof rawSet.tempo === "string" && rawSet.tempo.trim()
                ? rawSet.tempo.trim()
                : undefined,
            rpe:
              typeof rawSet.rpe === "number" && Number.isFinite(rawSet.rpe)
                ? rawSet.rpe
                : undefined,
            note:
              typeof rawSet.note === "string" && rawSet.note.trim()
                ? rawSet.note.trim()
                : undefined,
          } satisfies WorkoutExerciseInput["sets"][number];
        })
        .filter((set): set is WorkoutExerciseInput["sets"][number] => set !== null)
    : [];

  if (sets.length === 0) {
    return null;
  }

  const focus =
    typeof rawExercise.focus === "string" && rawExercise.focus.trim()
      ? rawExercise.focus.trim()
      : undefined;
  const note =
    typeof rawExercise.note === "string" && rawExercise.note.trim()
      ? rawExercise.note.trim()
      : undefined;

  return {
    name,
    focus,
    note,
    sets,
  } satisfies WorkoutExerciseInput;
}

function parseFirstWorkoutFields(raw: string | null | undefined) {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const candidates = [cleaned];
  const objectStart = cleaned.indexOf("{");
  const objectEnd = cleaned.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(cleaned.slice(objectStart, objectEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<GeneratedFirstWorkout>;
      if (
        typeof parsed.planTitle !== "string" ||
        typeof parsed.planGoal !== "string" ||
        typeof parsed.sessionTitle !== "string" ||
        typeof parsed.sessionObjective !== "string" ||
        typeof parsed.location !== "string" ||
        typeof parsed.coachNote !== "string" ||
        typeof parsed.sessionNote !== "string" ||
        !Array.isArray(parsed.focusAreas) ||
        !Array.isArray(parsed.sessionPattern) ||
        !Array.isArray(parsed.exercises)
      ) {
        continue;
      }

      const sessionKind =
        parsed.sessionKind === "solo" ||
        parsed.sessionKind === "duo" ||
        parsed.sessionKind === "group"
          ? parsed.sessionKind
          : null;
      if (!sessionKind) {
        continue;
      }

      const exercises = parsed.exercises
        .map<WorkoutExerciseInput | null>((exercise) =>
          normalizeWorkoutExerciseInput(exercise),
        )
        .filter((exercise): exercise is WorkoutExerciseInput => exercise !== null);

      if (exercises.length === 0) {
        continue;
      }

      return {
        planTitle: parsed.planTitle.trim(),
        planGoal: parsed.planGoal.trim(),
        focusAreas: parsed.focusAreas
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4),
        sessionPattern: parsed.sessionPattern
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4),
        sessionTitle: parsed.sessionTitle.trim(),
        sessionObjective: parsed.sessionObjective.trim(),
        sessionKind,
        location: parsed.location.trim(),
        coachNote: parsed.coachNote.trim(),
        sessionNote: parsed.sessionNote.trim(),
        exercises,
      } satisfies GeneratedFirstWorkout;
    } catch {
      continue;
    }
  }

  return null;
}

function takeFirstNonEmpty(primary: string | undefined, fallback: string) {
  const nextValue = primary?.trim();
  return nextValue && nextValue.length > 0 ? nextValue : fallback;
}

function mergeStringLists(primary: string[], fallback: string[], limit = 4) {
  const seen = new Set<string>();
  const merged: string[] = [];

  [...primary, ...fallback].forEach((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(normalized);
  });

  return merged.slice(0, limit);
}

function ensureFiveExercises(
  primary: WorkoutExerciseInput[],
  fallback: WorkoutExerciseInput[],
) {
  const nextExercises: WorkoutExerciseInput[] = [];
  const seen = new Set<string>();

  [...primary, ...fallback].forEach((exercise) => {
    if (nextExercises.length >= 5) {
      return;
    }

    const key = exercise.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    nextExercises.push(exercise);
  });

  return nextExercises.slice(0, 5);
}

function inferSessionKind(client: ClientProfile): SessionKind {
  const profileText = [client.gender, ...client.tags, ...client.goals, client.notes]
    .join(" ")
    .toLowerCase();

  if (/(small group|group|micro-group)/i.test(profileText)) {
    return "group";
  }

  if (/\bduo\b|partner|friend/i.test(profileText)) {
    return "duo";
  }

  return "solo";
}

function inferPrimaryTrainingTheme(client: ClientProfile) {
  const profileText = [
    client.gender,
    ...client.tags,
    ...client.goals,
    client.notes,
    ...client.healthFlags.map((flag) => `${flag.title} ${flag.detail}`),
  ]
    .join(" ")
    .toLowerCase();

  return {
    profileText,
    isPostpartum: /postpartum|pelvic floor/i.test(profileText),
    isBeginner: /beginner|confidence|machine|first gym/i.test(profileText),
    wantsFatLoss: /fat loss|waist|reduction|lean/i.test(profileText),
    wantsMassGain: /mass gain|muscle|bulk|hypertrophy/i.test(profileText),
    wantsLowerBody: /lower-body|lower body|glute|leg/i.test(profileText),
    wantsPosture: /posture|thoracic|desk|neck|shoulder/i.test(profileText),
    wantsCoreControl: /core control|core|stability/i.test(profileText),
    kneeSensitive: /knee/i.test(profileText),
    shoulderSensitive: /shoulder/i.test(profileText),
  };
}

function getPreferredLocation(input: FirstWorkoutInput) {
  return (
    input.trainingLocations?.[0]?.name?.trim() ||
    input.recentSessions[0]?.location?.trim() ||
    "Atlas Studio A"
  );
}

function buildExerciseSet(
  label: string,
  reps: string,
  extras?: Partial<WorkoutExerciseInput["sets"][number]>,
) {
  return {
    label,
    reps,
    ...extras,
  };
}

function buildFallbackExercises(input: FirstWorkoutInput): WorkoutExerciseInput[] {
  const { locale } = input;
  const theme = inferPrimaryTrainingTheme(input.client);

  if (locale === "et") {
    if (theme.isPostpartum || theme.wantsCoreControl) {
      return [
        {
          name: "Hingamine + dead bug",
          focus: "Kere kontroll ja hingamisrutiin",
          note: "Alusta rahuliku hingamise ja kere aktiveerimisega.",
          sets: [
            buildExerciseSet("1", "6/6", { tempo: "aeglane", rpe: 5 }),
            buildExerciseSet("2", "6/6", { tempo: "aeglane", rpe: 5 }),
          ],
        },
        {
          name: "Karikakükk kastile",
          focus: "Kontrollitud põlve- ja puusatöö",
          note: theme.kneeSensitive
            ? "Hoia liikumisulatus valuvaba ja tempo kontrollitud."
            : "Õpeta stabiilne küki lähteasend ja hingamine.",
          sets: [
            buildExerciseSet("1", "8", { tempo: "3111", rpe: 6 }),
            buildExerciseSet("2", "8", { tempo: "3111", rpe: 6 }),
            buildExerciseSet("3", "8", { tempo: "3111", rpe: 7 }),
          ],
        },
        {
          name: "Istudes kaablisõudmine",
          focus: "Ülaselja kontroll",
          sets: [
            buildExerciseSet("1", "10", { rpe: 6 }),
            buildExerciseSet("2", "10", { rpe: 6 }),
            buildExerciseSet("3", "10", { rpe: 7 }),
          ],
        },
        {
          name: "Rumeenia jõutõmme hantlitega",
          focus: "Puusahinge baas",
          sets: [
            buildExerciseSet("1", "8", { tempo: "3011", rpe: 6 }),
            buildExerciseSet("2", "8", { tempo: "3011", rpe: 6 }),
            buildExerciseSet("3", "8", { tempo: "3011", rpe: 7 }),
          ],
        },
        {
          name: "Kohverkand",
          focus: "Kere stabiilsus ja haardejõud",
          sets: [
            buildExerciseSet("1", "20 m / pool", { rpe: 6 }),
            buildExerciseSet("2", "20 m / pool", { rpe: 6 }),
          ],
        },
      ];
    }

    if (theme.wantsMassGain || theme.wantsPosture || theme.shoulderSensitive) {
      return [
        {
          name: "Dead bug",
          focus: "Kere pinge ja ribide kontroll",
          sets: [
            buildExerciseSet("1", "6/6", { tempo: "aeglane", rpe: 5 }),
            buildExerciseSet("2", "6/6", { tempo: "aeglane", rpe: 5 }),
          ],
        },
        {
          name: "Karikakükk",
          focus: "Täiskeha baasjõud",
          sets: [
            buildExerciseSet("1", "8", { tempo: "3011", rpe: 6 }),
            buildExerciseSet("2", "8", { tempo: "3011", rpe: 6 }),
            buildExerciseSet("3", "8", { tempo: "3011", rpe: 7 }),
          ],
        },
        {
          name: "Hantlitega kaldpingi surumine",
          focus: "Õlasõbralik surumismuster",
          note: theme.shoulderSensitive
            ? "Hoia neutraalset haaret ja väldi valu."
            : "Ehita kontrollitud ülakeha jõudu ilma liigselt tempot tõstmata.",
          sets: [
            buildExerciseSet("1", "8", { rpe: 6 }),
            buildExerciseSet("2", "8", { rpe: 6 }),
            buildExerciseSet("3", "8", { rpe: 7 }),
          ],
        },
        {
          name: "Rinnatoega sõudmine",
          focus: "Rüht ja ülaselg",
          sets: [
            buildExerciseSet("1", "10", { rpe: 6 }),
            buildExerciseSet("2", "10", { rpe: 6 }),
            buildExerciseSet("3", "10", { rpe: 7 }),
          ],
        },
        {
          name: "Farmeri kand",
          focus: "Tervikkeha pinge ja töövõime",
          sets: [
            buildExerciseSet("1", "25 m", { rpe: 6 }),
            buildExerciseSet("2", "25 m", { rpe: 7 }),
          ],
        },
      ];
    }

    if (theme.wantsLowerBody || theme.kneeSensitive || theme.wantsFatLoss) {
      return [
        {
          name: "Dead bug",
          focus: "Kere kontroll",
          sets: [
            buildExerciseSet("1", "6/6", { tempo: "aeglane", rpe: 5 }),
            buildExerciseSet("2", "6/6", { tempo: "aeglane", rpe: 5 }),
          ],
        },
        {
          name: theme.kneeSensitive ? "Karikakükk kastile" : "Karikakükk",
          focus: "Alakeha baasjõud",
          note: theme.kneeSensitive
            ? "Piira sügavust vastavalt põlvetaluvusele."
            : "Hoia kere püstisem ja liikumine kontrollitud.",
          sets: [
            buildExerciseSet("1", "8", { tempo: "3111", rpe: 6 }),
            buildExerciseSet("2", "8", { tempo: "3111", rpe: 6 }),
            buildExerciseSet("3", "8", { tempo: "3111", rpe: 7 }),
          ],
        },
        {
          name: "Rumeenia jõutõmme hantlitega",
          focus: "Tagakett",
          sets: [
            buildExerciseSet("1", "8", { rpe: 6 }),
            buildExerciseSet("2", "8", { rpe: 6 }),
            buildExerciseSet("3", "8", { rpe: 7 }),
          ],
        },
        {
          name: "Istudes kaablisõudmine",
          focus: "Ülaselja stabiilsus",
          sets: [
            buildExerciseSet("1", "10", { rpe: 6 }),
            buildExerciseSet("2", "10", { rpe: 6 }),
            buildExerciseSet("3", "10", { rpe: 7 }),
          ],
        },
        {
          name: "Pallof press",
          focus: "Pöördevastane kere töö",
          sets: [
            buildExerciseSet("1", "10/10", { rpe: 6 }),
            buildExerciseSet("2", "10/10", { rpe: 6 }),
          ],
        },
      ];
    }

    return [
      {
        name: "Dead bug",
        focus: "Kere kontroll",
        sets: [
          buildExerciseSet("1", "6/6", { tempo: "aeglane", rpe: 5 }),
          buildExerciseSet("2", "6/6", { tempo: "aeglane", rpe: 5 }),
        ],
      },
      {
        name: theme.isBeginner ? "Jalapress" : "Karikakükk",
        focus: "Alakeha baas",
        sets: [
          buildExerciseSet("1", "10", { rpe: 6 }),
          buildExerciseSet("2", "10", { rpe: 6 }),
          buildExerciseSet("3", "10", { rpe: 7 }),
        ],
      },
      {
        name: "Hantlitega Rumeenia jõutõmme",
        focus: "Puusahing ja tagakett",
        sets: [
          buildExerciseSet("1", "8", { rpe: 6 }),
          buildExerciseSet("2", "8", { rpe: 6 }),
          buildExerciseSet("3", "8", { rpe: 7 }),
        ],
      },
      {
        name: "Istudes sõudmine",
        focus: "Rüht ja ülaselg",
        sets: [
          buildExerciseSet("1", "10", { rpe: 6 }),
          buildExerciseSet("2", "10", { rpe: 6 }),
          buildExerciseSet("3", "10", { rpe: 7 }),
        ],
      },
      {
        name: "Kaldpingil hantlitega surumine",
        focus: "Turvaline ülakeha töö",
        sets: [
          buildExerciseSet("1", "8", { rpe: 6 }),
          buildExerciseSet("2", "8", { rpe: 6 }),
          buildExerciseSet("3", "8", { rpe: 7 }),
        ],
      },
    ];
  }

  if (theme.isPostpartum || theme.wantsCoreControl) {
    return [
      {
        name: "Breathing dead bug",
        focus: "Core control and breathing sequence",
        note: "Open the session with slow breathing and tension awareness.",
        sets: [
          buildExerciseSet("1", "6/6", { tempo: "slow", rpe: 5 }),
          buildExerciseSet("2", "6/6", { tempo: "slow", rpe: 5 }),
        ],
      },
      {
        name: "Goblet box squat",
        focus: "Controlled squat pattern",
        note: theme.kneeSensitive
          ? "Keep depth inside pain-free knee tolerance."
          : "Use the box to keep tempo and bracing consistent.",
        sets: [
          buildExerciseSet("1", "8", { tempo: "3111", rpe: 6 }),
          buildExerciseSet("2", "8", { tempo: "3111", rpe: 6 }),
          buildExerciseSet("3", "8", { tempo: "3111", rpe: 7 }),
        ],
      },
      {
        name: "Seated cable row",
        focus: "Upper-back control",
        sets: [
          buildExerciseSet("1", "10", { rpe: 6 }),
          buildExerciseSet("2", "10", { rpe: 6 }),
          buildExerciseSet("3", "10", { rpe: 7 }),
        ],
      },
      {
        name: "Dumbbell Romanian deadlift",
        focus: "Hip hinge foundation",
        sets: [
          buildExerciseSet("1", "8", { tempo: "3011", rpe: 6 }),
          buildExerciseSet("2", "8", { tempo: "3011", rpe: 6 }),
          buildExerciseSet("3", "8", { tempo: "3011", rpe: 7 }),
        ],
      },
      {
        name: "Suitcase carry",
        focus: "Core stability and grip",
        sets: [
          buildExerciseSet("1", "20 m / side", { rpe: 6 }),
          buildExerciseSet("2", "20 m / side", { rpe: 6 }),
        ],
      },
    ];
  }

  if (theme.wantsMassGain || theme.wantsPosture || theme.shoulderSensitive) {
    return [
      {
        name: "Dead bug",
        focus: "Ribcage and core tension",
        sets: [
          buildExerciseSet("1", "6/6", { tempo: "slow", rpe: 5 }),
          buildExerciseSet("2", "6/6", { tempo: "slow", rpe: 5 }),
        ],
      },
      {
        name: "Goblet squat",
        focus: "Full-body strength base",
        sets: [
          buildExerciseSet("1", "8", { tempo: "3011", rpe: 6 }),
          buildExerciseSet("2", "8", { tempo: "3011", rpe: 6 }),
          buildExerciseSet("3", "8", { tempo: "3011", rpe: 7 }),
        ],
      },
      {
        name: "Incline dumbbell press",
        focus: "Shoulder-friendly press pattern",
        note: theme.shoulderSensitive
          ? "Keep a neutral grip and stop short of any shoulder irritation."
          : "Build pressing strength with controlled range.",
        sets: [
          buildExerciseSet("1", "8", { rpe: 6 }),
          buildExerciseSet("2", "8", { rpe: 6 }),
          buildExerciseSet("3", "8", { rpe: 7 }),
        ],
      },
      {
        name: "Chest-supported row",
        focus: "Posture and upper-back strength",
        sets: [
          buildExerciseSet("1", "10", { rpe: 6 }),
          buildExerciseSet("2", "10", { rpe: 6 }),
          buildExerciseSet("3", "10", { rpe: 7 }),
        ],
      },
      {
        name: "Farmer carry",
        focus: "Whole-body tension and work capacity",
        sets: [
          buildExerciseSet("1", "25 m", { rpe: 6 }),
          buildExerciseSet("2", "25 m", { rpe: 7 }),
        ],
      },
    ];
  }

  if (theme.wantsLowerBody || theme.kneeSensitive || theme.wantsFatLoss) {
    return [
      {
        name: "Dead bug",
        focus: "Core control",
        sets: [
          buildExerciseSet("1", "6/6", { tempo: "slow", rpe: 5 }),
          buildExerciseSet("2", "6/6", { tempo: "slow", rpe: 5 }),
        ],
      },
      {
        name: theme.kneeSensitive ? "Goblet squat to box" : "Goblet squat",
        focus: "Lower-body strength base",
        note: theme.kneeSensitive
          ? "Keep the range inside current knee tolerance."
          : "Use controlled tempo and stable foot pressure.",
        sets: [
          buildExerciseSet("1", "8", { tempo: "3111", rpe: 6 }),
          buildExerciseSet("2", "8", { tempo: "3111", rpe: 6 }),
          buildExerciseSet("3", "8", { tempo: "3111", rpe: 7 }),
        ],
      },
      {
        name: "Dumbbell Romanian deadlift",
        focus: "Posterior-chain awareness",
        sets: [
          buildExerciseSet("1", "8", { rpe: 6 }),
          buildExerciseSet("2", "8", { rpe: 6 }),
          buildExerciseSet("3", "8", { rpe: 7 }),
        ],
      },
      {
        name: "Seated cable row",
        focus: "Upper-back support",
        sets: [
          buildExerciseSet("1", "10", { rpe: 6 }),
          buildExerciseSet("2", "10", { rpe: 6 }),
          buildExerciseSet("3", "10", { rpe: 7 }),
        ],
      },
      {
        name: "Pallof press",
        focus: "Anti-rotation trunk control",
        sets: [
          buildExerciseSet("1", "10/10", { rpe: 6 }),
          buildExerciseSet("2", "10/10", { rpe: 6 }),
        ],
      },
    ];
  }

  return [
    {
      name: "Dead bug",
      focus: "Core control",
      sets: [
        buildExerciseSet("1", "6/6", { tempo: "slow", rpe: 5 }),
        buildExerciseSet("2", "6/6", { tempo: "slow", rpe: 5 }),
      ],
    },
    {
      name: theme.isBeginner ? "Leg press" : "Goblet squat",
      focus: "Lower-body foundation",
      sets: [
        buildExerciseSet("1", "10", { rpe: 6 }),
        buildExerciseSet("2", "10", { rpe: 6 }),
        buildExerciseSet("3", "10", { rpe: 7 }),
      ],
    },
    {
      name: "Dumbbell Romanian deadlift",
      focus: "Hip hinge pattern",
      sets: [
        buildExerciseSet("1", "8", { rpe: 6 }),
        buildExerciseSet("2", "8", { rpe: 6 }),
        buildExerciseSet("3", "8", { rpe: 7 }),
      ],
    },
    {
      name: "Seated row",
      focus: "Upper-back control",
      sets: [
        buildExerciseSet("1", "10", { rpe: 6 }),
        buildExerciseSet("2", "10", { rpe: 6 }),
        buildExerciseSet("3", "10", { rpe: 7 }),
      ],
    },
    {
      name: "Incline dumbbell press",
      focus: "Simple press pattern",
      sets: [
        buildExerciseSet("1", "8", { rpe: 6 }),
        buildExerciseSet("2", "8", { rpe: 6 }),
        buildExerciseSet("3", "8", { rpe: 7 }),
      ],
    },
  ];
}

function buildFallbackFirstWorkout(input: FirstWorkoutInput): GeneratedFirstWorkout {
  const { locale, client, recentAssessments } = input;
  const latestAssessment = getLatestAssessment(recentAssessments);
  const theme = inferPrimaryTrainingTheme(client);
  const primaryGoal = client.goals[0]?.trim() || (locale === "et" ? "kindel treeningu rutiin" : "a consistent training routine");
  const focusAreas =
    locale === "et"
      ? mergeStringLists(
          [
            theme.wantsLowerBody ? "Alakeha baasjõud" : "",
            theme.wantsPosture ? "Rüht ja ülaselg" : "",
            theme.wantsCoreControl || theme.isPostpartum ? "Kere kontroll" : "",
            theme.wantsFatLoss ? "Töövõime ja liikumiskvaliteet" : "Liigutuste tehnika",
          ].filter(Boolean),
          [primaryGoal, "Tempo kontroll", "Koormuse taluvuse jälgimine"],
        )
      : mergeStringLists(
          [
            theme.wantsLowerBody ? "Lower-body strength base" : "",
            theme.wantsPosture ? "Posture and upper-back strength" : "",
            theme.wantsCoreControl || theme.isPostpartum ? "Core control" : "",
            theme.wantsFatLoss ? "Work capacity and movement quality" : "Technique quality",
          ].filter(Boolean),
          [primaryGoal, "Tempo control", "Load tolerance monitoring"],
        );
  const sessionPattern =
    locale === "et"
      ? mergeStringLists(
          ["Täiskeha baas", "Tehnika enne koormust", "Mõõdukas RPE"],
          theme.isBeginner ? ["Selged õpetuspunktid"] : ["Progressioon järgmise sessiooni jaoks"],
        )
      : mergeStringLists(
          ["Full-body foundation", "Technique before load", "Moderate RPE"],
          theme.isBeginner ? ["Simple coaching cues"] : ["Progression path for the next session"],
        );

  return {
    planTitle:
      locale === "et"
        ? `Alustusplokk: ${primaryGoal}`
        : `Starter block: ${primaryGoal}`,
    planGoal:
      locale === "et"
        ? `Ehita esimese kahe nädala jooksul turvaline ja järjepidev algus eesmärgiga ${primaryGoal.toLowerCase()}.`
        : `Build a safe and consistent first two weeks around ${primaryGoal.toLowerCase()}.`,
    focusAreas,
    sessionPattern,
    sessionTitle:
      locale === "et"
        ? "1. treening: baasliikumised ja koormuse tunnetus"
        : "Session 1: movement foundations and load feel",
    sessionObjective:
      locale === "et"
        ? "Õpeta 5 põhiharjutust, hinda liikumiskvaliteeti ja salvesta turvaline esimene koormustase."
        : "Teach 5 core exercises, assess movement quality, and capture a safe starting load.",
    sessionKind: inferSessionKind(client),
    location: getPreferredLocation(input),
    coachNote:
      locale === "et"
        ? [
            `Hoia esimene sessioon mõõdukal raskusel ja kogu märkmeid selle kohta, kuidas klient reageerib juhendamisele ning koormusele.`,
            latestAssessment?.notes
              ? `Viimane kehaanalüüs: ${latestAssessment.notes}`
              : "Kui varasemaid mõõtmisi ei ole, kasuta esimest treeningut baasjoone loomiseks.",
          ].join(" ")
        : [
            "Keep the first session at a moderate difficulty and capture how the client responds to coaching cues and load.",
            latestAssessment?.notes
              ? `Latest body assessment note: ${latestAssessment.notes}`
              : "If there are no prior assessments, use this session to establish the first baseline.",
          ].join(" "),
    sessionNote:
      locale === "et"
        ? "Esimene trenn keskendub tehnikale, enesetundele ja turvalisele algtasemele."
        : "This first session focuses on technique, readiness, and a safe starting baseline.",
    exercises: buildFallbackExercises(input),
  };
}

function mergeFirstWorkoutWithFallback(
  fallback: GeneratedFirstWorkout,
  parsed: GeneratedFirstWorkout | null,
): GeneratedFirstWorkout {
  if (!parsed) {
    return {
      ...fallback,
      exercises: ensureFiveExercises([], fallback.exercises),
    };
  }

  return {
    planTitle: takeFirstNonEmpty(parsed.planTitle, fallback.planTitle),
    planGoal: takeFirstNonEmpty(parsed.planGoal, fallback.planGoal),
    focusAreas: mergeStringLists(parsed.focusAreas, fallback.focusAreas),
    sessionPattern: mergeStringLists(parsed.sessionPattern, fallback.sessionPattern),
    sessionTitle: takeFirstNonEmpty(parsed.sessionTitle, fallback.sessionTitle),
    sessionObjective: takeFirstNonEmpty(
      parsed.sessionObjective,
      fallback.sessionObjective,
    ),
    sessionKind: parsed.sessionKind ?? fallback.sessionKind,
    location: takeFirstNonEmpty(parsed.location, fallback.location),
    coachNote: takeFirstNonEmpty(parsed.coachNote, fallback.coachNote),
    sessionNote: takeFirstNonEmpty(parsed.sessionNote, fallback.sessionNote),
    exercises: ensureFiveExercises(parsed.exercises, fallback.exercises),
  };
}

function roundToNearest(value: number, step = 5) {
  return Math.max(step, Math.round(value / step) * step);
}

function findMetricValue(
  assessment: BodyAssessment | undefined,
  patterns: RegExp[],
) {
  if (!assessment) {
    return null;
  }

  const match = assessment.metrics.find((metric) =>
    patterns.some((pattern) => pattern.test(metric.label)),
  );
  return match?.value ?? null;
}

function normalizeMealDistribution(
  breakfast: number,
  lunch: number,
  dinner: number,
) {
  const total = breakfast + lunch + dinner;
  if (!Number.isFinite(total) || total <= 0) {
    return {
      breakfastSharePercent: 30,
      lunchSharePercent: 35,
      dinnerSharePercent: 35,
    };
  }

  const normalizedBreakfast = Math.max(15, Math.round((breakfast / total) * 100));
  const normalizedLunch = Math.max(20, Math.round((lunch / total) * 100));
  let normalizedDinner = 100 - normalizedBreakfast - normalizedLunch;

  if (normalizedDinner < 20) {
    normalizedDinner = 20;
  }

  const diff = 100 - (normalizedBreakfast + normalizedLunch + normalizedDinner);
  return {
    breakfastSharePercent: normalizedBreakfast,
    lunchSharePercent: normalizedLunch + diff,
    dinnerSharePercent: normalizedDinner,
  };
}

function buildFallbackNutritionPlan(input: NutritionPlanInput): GeneratedNutritionPlan {
  const { client, locale, recentAssessments, recentSessions } = input;
  const latestAssessment = getLatestAssessment(recentAssessments);
  const profileText = [
    client.goals.join(" "),
    client.tags.join(" "),
    client.notes,
    client.healthFlags.map((flag) => `${flag.title} ${flag.detail}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const weight = findMetricValue(latestAssessment, [/weight/i, /^kg$/i]);
  const isFatLoss = /(fat loss|waist|reduction|lean|drop)/i.test(profileText);
  const isMassGain = /(mass|gain|muscle|bulk|hypertrophy)/i.test(profileText);
  const prefersPortableBreakfast = /(travel|portable breakfast|morning|commute)/i.test(profileText);
  const lateDinnerPattern = /(evening|late|work late|after work)/i.test(profileText);
  const weeklySessions = recentSessions.filter(
    (session) => session.status === "planned" || session.status === "in-progress" || session.status === "completed",
  ).length;

  const calories = isMassGain
    ? roundToNearest((weight ?? 80) * 37, 10)
    : isFatLoss
      ? roundToNearest((weight ?? 68) * 28, 10)
      : roundToNearest((weight ?? 72) * 31, 10);
  const proteinGrams = roundToNearest((weight ?? (isMassGain ? 82 : 70)) * 1.9, 5);
  const fatsGrams = roundToNearest(
    isMassGain
      ? (weight ?? 80) * 1
      : isFatLoss
        ? (weight ?? 68) * 0.9
        : (weight ?? 72) * 0.95,
    1,
  );
  const carbsGrams = roundToNearest(
    Math.max(120, (calories - proteinGrams * 4 - fatsGrams * 9) / 4),
    5,
  );
  const hydrationLiters = Math.round((((weight ?? 70) * 0.035) + Math.min(0.6, weeklySessions * 0.1)) * 10) / 10;
  const mealDistribution = normalizeMealDistribution(
    prefersPortableBreakfast ? 26 : 30,
    34,
    lateDinnerPattern || isMassGain ? 40 : 36,
  );

  const principles =
    locale === "et"
      ? [
          isMassGain
            ? "Hoia lõuna ja õhtusöök süsivesikurikkad, et kogu päevane energia tuleks päriselt täis."
            : isFatLoss
              ? "Alusta päeva valgu ja kiudainetega, et õhtune isu oleks paremini kontrolli all."
              : "Jaga valk ühtlaselt kolme põhitoidukorra peale, et taastumine püsiks stabiilne.",
          prefersPortableBreakfast
            ? "Valmista ette lihtne kaasavõetav hommikusöök, mida on lihtne hoida ka kiirel või reisipäeval."
            : "Hoia hommikusöök korduv ja lihtne, et päev algaks ilma otsustusväsimuseta.",
          client.healthFlags.length > 0
            ? `Arvesta tervisefookusega: ${client.healthFlags[0]?.detail ?? client.healthFlags[0]?.title}.`
            : "Jäta nädalasse üks paindlik toidukord, et plaan püsiks ka reaalses elus.",
          latestAssessment?.notes
            ? `Viimase kehaanalüüsi fookus: ${latestAssessment.notes}`
            : "Vaata energiataset ja treeningujärgset taastumist üle iga nädala lõpus.",
        ]
      : [
          isMassGain
            ? "Keep lunch and dinner carb-forward so total daily energy is actually achieved."
            : isFatLoss
              ? "Anchor the day with protein and fiber so evening hunger stays easier to manage."
              : "Distribute protein evenly across the three main meals to keep recovery steady.",
          prefersPortableBreakfast
            ? "Use a portable breakfast option that still works on rushed or travel-heavy days."
            : "Keep breakfast repeatable and low-friction so the day starts without decision fatigue.",
          client.healthFlags.length > 0
            ? `Adjust food structure to support the current health flag: ${client.healthFlags[0]?.detail ?? client.healthFlags[0]?.title}.`
            : "Leave one flexible meal in the week so the plan stays realistic.",
          latestAssessment?.notes
            ? `Latest body-composition context: ${latestAssessment.notes}`
            : "Review energy and post-session recovery weekly and adjust from that trend.",
        ];

  const coachRecommendation =
    locale === "et"
      ? [
          latestAssessment?.notes
            ? `Viimane kehaanalüüs ütleb: ${latestAssessment.notes}`
            : "Kasuta järgmise kahe nädala jooksul energiataset ja treeningujärgset taastumist peamise kontrollpunktina.",
          isFatLoss
            ? "Praegune fookus on mõõdukas defitsiit ilma valgu või treeningutaluvuse arvelt järele andmata."
            : isMassGain
              ? "Praegune fookus on järjepidev energiaküllus, eriti päeva teises pooles ja pärast trenni."
              : "Praegune fookus on stabiilne taastumine, valgujaotus ja lihtne igapäevane rütm.",
        ].join(" ")
      : [
          latestAssessment?.notes
            ? `Latest body assessment note: ${latestAssessment.notes}`
            : "Use energy levels and post-session recovery as the main checkpoint over the next two weeks.",
          isFatLoss
            ? "The current target is a moderate deficit without sacrificing protein intake or training tolerance."
            : isMassGain
              ? "The current target is consistent energy surplus, especially later in the day and after training."
              : "The current target is steady recovery, even protein distribution, and a low-friction daily rhythm.",
        ].join(" ");

  return {
    title:
      locale === "et"
        ? isMassGain
          ? "Massifaasi toitumisstruktuur"
          : isFatLoss
            ? "Rasvakaotust toetav toitumisstruktuur"
            : "Taastumist toetav toitumisstruktuur"
        : isMassGain
          ? "Mass-support nutrition structure"
          : isFatLoss
            ? "Fat-loss support nutrition structure"
            : "Recovery-support nutrition structure",
    calories,
    proteinGrams,
    carbsGrams,
    fatsGrams,
    hydrationLiters,
    principles: principles.slice(0, 4),
    breakfastSharePercent: mealDistribution.breakfastSharePercent,
    lunchSharePercent: mealDistribution.lunchSharePercent,
    dinnerSharePercent: mealDistribution.dinnerSharePercent,
    coachRecommendation,
  };
}

async function enhanceDraftWithOpenAI(
  fallback: AIDraft,
  taskInstruction: string,
  context: Record<string, unknown>,
) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  if (!client || !model) {
    return fallback;
  }

  const systemPrompt =
    "You write concise, high-signal CRM drafts for an experienced personal trainer. Return valid JSON only with keys title, subject, body, internalNote. Do not use markdown or code fences. Do not invent facts. Match the requested locale exactly.";

  const response = await client.responses.create({
    model,
    input: `${systemPrompt}\n\nTask:\n${taskInstruction}\n\nContext JSON:\n${safeJsonStringify(
      context,
    )}`,
  });

  const parsed = parseDraftFields(response.output_text);
  if (!parsed) {
    return fallback;
  }

  return {
    ...fallback,
    ...parsed,
    model,
    updatedAt: nowIso(),
  };
}

async function enhanceNutritionPlanWithOpenAI(
  fallback: GeneratedNutritionPlan,
  input: NutritionPlanInput,
) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  if (!client || !model) {
    return fallback;
  }

  const systemPrompt =
    "You create structured nutrition guidance for a coaching CRM. Return valid JSON only with keys title, calories, proteinGrams, carbsGrams, fatsGrams, hydrationLiters, principles, breakfastSharePercent, lunchSharePercent, dinnerSharePercent, coachRecommendation. Use concise values, 3-4 principles, and make breakfast/lunch/dinner percentages sum to 100. Do not use markdown or code fences. Do not invent measurements missing from the context.";

  const response = await client.responses.create({
    model,
    input: `${systemPrompt}\n\nTask:\n${
      input.locale === "et"
        ? "Koosta coach-facing toitumiskava soovitus, mis arvestab kliendi profiili, eesmärke, tervisefookusi, märkmeid, viimast kehaanalüüsi ja hiljutist treeningkoormust."
        : "Create a coach-facing nutrition recommendation that reflects the client profile, goals, health flags, notes, latest body assessment, and recent training load."
    }\n\nContext JSON:\n${safeJsonStringify({
      locale: input.locale,
      client: input.client,
      currentNutritionPlan: input.currentNutritionPlan,
      recentAssessments: input.recentAssessments.slice(0, 4),
      recentSessions: input.recentSessions.slice(0, 6),
    })}`,
  });

  const parsed = parseNutritionPlanFields(response.output_text);
  if (!parsed) {
    return fallback;
  }

  const mealDistribution = normalizeMealDistribution(
    parsed.breakfastSharePercent,
    parsed.lunchSharePercent,
    parsed.dinnerSharePercent,
  );

  return {
    ...parsed,
    ...mealDistribution,
  };
}

async function enhanceFirstWorkoutWithOpenAI(
  fallback: GeneratedFirstWorkout,
  input: FirstWorkoutInput,
) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  if (!client || !model) {
    return fallback;
  }

  const systemPrompt =
    "You create the first coached workout for a CRM. Return valid JSON only with keys planTitle, planGoal, focusAreas, sessionPattern, sessionTitle, sessionObjective, sessionKind, location, coachNote, sessionNote, exercises. sessionKind must be one of solo, duo, group. focusAreas and sessionPattern should each have 2 to 4 concise strings. exercises must contain exactly 5 exercise objects, and each exercise must have name, optional focus, optional note, and a non-empty sets array. Each set must have label and reps, with optional weightKg, tempo, rpe, and note. Do not use markdown, code fences, or commentary outside JSON. Do not invent medical facts or equipment that conflicts with the context.";

  const response = await client.responses.create({
    model,
    input: `${systemPrompt}\n\nTask:\n${
      input.locale === "et"
        ? "Koosta uue kliendi esimene treening ja sellega seotud treeninguploki algus. Treening peab olema turvaline, mõõdukas, õpetusliku iseloomuga ja sisaldama täpselt 5 harjutust."
        : "Create the first workout and starter block for a new client. The session should be safe, moderate, instructional, and contain exactly 5 exercises."
    }\n\nFallback JSON:\n${safeJsonStringify(
      fallback,
    )}\n\nContext JSON:\n${safeJsonStringify({
      locale: input.locale,
      client: input.client,
      recentAssessments: input.recentAssessments.slice(0, 4),
      recentSessions: input.recentSessions.slice(0, 4),
      trainingLocations: input.trainingLocations?.slice(0, 5),
    })}`,
  });

  return mergeFirstWorkoutWithFallback(
    fallback,
    parseFirstWorkoutFields(response.output_text),
  );
}

function buildFallbackWorkoutSummaryDraft(input: WorkoutSummaryInput) {
  const { client, locale, session, sessionWorkout, plannedWorkout, assessments } = input;
  const completion = sessionWorkout
    ? sessionWorkout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed)
        .length
    : 0;
  const totalSets = sessionWorkout
    ? sessionWorkout.exercises.flatMap((exercise) => exercise.sets).length
    : 0;
  const adjustments = summarizeExerciseAdjustments(sessionWorkout?.exercises ?? []);
  const latestAssessment = getLatestAssessment(assessments);

  if (locale === "et") {
    return baseDraft(
      "workout-summary",
      locale,
      client.id,
      session.id,
      "Treeningu kokkuvõte",
      "Tänase treeningu lühikokkuvõte",
      [
        `${client.fullName}, tänase sessiooni fookus oli ${plannedWorkout?.objective ?? session.title}.`,
        `Tegid ära ${completion}/${totalSets} planeeritud seeriast.`,
        adjustments.modified > 0
          ? `Treeningu jooksul kohandati ${adjustments.modified} harjutust vastavalt enesetundele või koormusele.`
          : "Treening kulges peaaegu täielikult plaani järgi.",
        latestAssessment
          ? `Viimase kehaanalüüsi trend toetab praegust suunda: ${latestAssessment.notes}`
          : "Jätkame sama suuna hoidmist ja taastumise jälgimist.",
        "Palun anna õhtul või homme hommikul märku, kuidas enesetunne püsib.",
      ].join("\n\n"),
      [
        sessionWorkout?.coachNote
          ? `Treeneri märge: ${sessionWorkout.coachNote}`
          : "Jälgi järgmises trennis koormuse tõstmise valmisolekut.",
        adjustments.skipped > 0
          ? `Välja jäänud harjutusi: ${adjustments.skipped}. Kontrolli järgmine kord põhjuseid.`
          : "Suurt kõrvalekallet plaanist ei olnud.",
      ].join("\n"),
      "workout-summary",
      [
        session.id,
        plannedWorkout?.id ?? "no-planned-workout",
        latestAssessment?.id ?? "no-assessment",
      ],
    );
  }

  return baseDraft(
    "workout-summary",
    locale,
    client.id,
    session.id,
    "Post-session recap",
    "Quick recap from today’s session",
    [
      `${client.fullName}, today’s focus was ${plannedWorkout?.objective ?? session.title}.`,
      `You completed ${completion} out of ${totalSets} planned sets.`,
      adjustments.modified > 0
        ? `${adjustments.modified} exercises were adjusted during the session to match how you were moving and feeling.`
        : "The session stayed very close to the original plan.",
      latestAssessment
        ? `Your latest body assessment supports this direction: ${latestAssessment.notes}`
        : "We will keep building from the same baseline next session.",
      "Send me a short note later today if anything feels unusually sore or unusually easy.",
    ].join("\n\n"),
    [
      sessionWorkout?.coachNote
        ? `Coach note: ${sessionWorkout.coachNote}`
        : "Monitor whether load can increase next session.",
      adjustments.skipped > 0
        ? `Skipped exercises: ${adjustments.skipped}. Revisit why before the next block.`
        : "No major deviation from plan.",
    ].join("\n"),
    "workout-summary",
    [
      session.id,
      plannedWorkout?.id ?? "no-planned-workout",
      latestAssessment?.id ?? "no-assessment",
    ],
  );
}

function buildFallbackNextSessionDraft(input: WorkoutSummaryInput) {
  const { client, locale, session, sessionWorkout, plannedWorkout } = input;
  const adjustments = summarizeExerciseAdjustments(sessionWorkout?.exercises ?? []);
  const hasModifiedLoad = adjustments.modified > 0 || adjustments.skipped > 0;

  if (locale === "et") {
    return baseDraft(
      "next-session",
      locale,
      client.id,
      session.id,
      "Järgmise trenni soovitus",
      "Järgmise sessiooni sisemine soovitus",
      [
        `Jätka kliendiga ${plannedWorkout?.title ?? session.title} liini, kuid kohanda koormus vastavalt tänasele reaktsioonile.`,
        hasModifiedLoad
          ? "Kuna tänases sessioonis tuli plaani muuta, hoia järgmise trenni algus konservatiivsem ja ehita enesekindluse peale."
          : "Kuna tänane treening püsis plaanis, võib põhiharjutuses kaaluda väikest koormuse tõusu.",
        "Alusta kiire enesetunde kontrolliga: uni, liigeste tunne ja üldine energiaseis.",
      ].join("\n\n"),
      "Kasuta seda sisemise juhisena järgmise sessiooni ettevalmistamisel.",
      "next-session",
      [session.id, plannedWorkout?.id ?? "no-planned-workout"],
    );
  }

  return baseDraft(
    "next-session",
    locale,
    client.id,
    session.id,
    "Next-session guidance",
    "Internal recommendation for the next session",
    [
      `Continue the ${plannedWorkout?.title ?? session.title} thread, but anchor load selection to the response from today.`,
      hasModifiedLoad
        ? "Because today required on-the-fly adjustments, start the next session slightly more conservative and rebuild momentum from clean reps."
        : "Because today stayed on-plan, consider a small load increase on the primary lift if readiness is still good.",
      "Open with a short readiness check covering sleep, joint feel, and overall energy.",
    ].join("\n\n"),
    "Use this as an internal coaching note before finalizing the next session.",
    "next-session",
    [session.id, plannedWorkout?.id ?? "no-planned-workout"],
  );
}

function buildFallbackAdaptivePlanDraft(input: AdaptivePlanInput) {
  const { client, locale, currentWorkoutPlan, recentAssessments, recentSessions, kind } = input;
  const latestAssessment = getLatestAssessment(recentAssessments);
  const latestSession = [...recentSessions].sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
  const title =
    kind === "workout"
      ? locale === "et"
        ? "Treeninguploki AI mustand"
        : "AI workout block draft"
      : locale === "et"
        ? "Toitumiskava AI mustand"
        : "AI nutrition draft";

  const subject =
    kind === "workout"
      ? locale === "et"
        ? "Uuendatud treeninguploki soovitus"
        : "Updated workout block recommendation"
      : locale === "et"
        ? "Uuendatud toitumise soovitus"
        : "Updated nutrition recommendation";

  const bodyParts =
    kind === "workout"
      ? locale === "et"
        ? [
            `${client.fullName} järgmine plokk võiks jätkata fookusega: ${currentWorkoutPlan?.goal ?? "tulemuslik, kuid taastumist arvestav areng"}.`,
            latestAssessment
              ? `Viimane mõõtmine: ${latestAssessment.notes}`
              : "Kasuta varasemate treeningute trendi põhiotsuste tegemiseks.",
            latestSession
              ? `Viimane sessioon kalendris: ${latestSession.title}. Ehita järgmine plokk selle töövõime peale.`
              : "Tee esimene plokk lihtsa progressiooniloogikaga.",
            "Soovitus: 2 põhijõu fookusega päeva ja 1 lühem taastumist toetav päev või kodune lisaliikumine.",
          ]
        : [
            `${client.fullName}'s next block should continue the direction of ${currentWorkoutPlan?.goal ?? "sustainable progress with recovery in view"}.`,
            latestAssessment
              ? `Latest assessment context: ${latestAssessment.notes}`
              : "Use recent training trends as the main decision driver.",
            latestSession
              ? `Latest scheduled session: ${latestSession.title}. Build the next block from that execution quality.`
              : "Start with a simple, highly teachable progression model.",
            "Recommendation: 2 primary strength sessions and 1 shorter recovery-support session or home assignment.",
          ]
      : locale === "et"
        ? [
            `${client.fullName} toitumise uuendus peaks toetama praegust treeningmahtu ja taastumist.`,
            latestAssessment
              ? `Viimase kehaanalüüsi põhjal: ${latestAssessment.notes}`
              : "Kasuta toitumise uuenduses kliendi energia- ja treeningutaluvuse tagasisidet.",
            "Soovitus: hoia valk igas põhitoidukorras, lisa lihtne treeningujärgne struktuur ja üks realistlik nädalavahetuse paindlikkuse reegel.",
          ]
        : [
            `${client.fullName}'s nutrition update should support current training load and recovery quality.`,
            latestAssessment
              ? `Latest body assessment note: ${latestAssessment.notes}`
              : "Use training tolerance and energy feedback to steer the nutrition update.",
            "Recommendation: keep protein anchored to each main meal, add a simple post-workout structure, and retain one realistic weekend flexibility rule.",
          ];

  return baseDraft(
    kind === "workout" ? "workout-plan" : "nutrition-plan",
    locale,
    client.id,
    undefined,
    title,
    subject,
    bodyParts.join("\n\n"),
    locale === "et"
      ? "Treener vaatab mustandi üle enne kliendile kinnitamist."
      : "Coach reviews this draft before confirming it for the client.",
    kind === "workout" ? "workout-plan" : "nutrition-plan",
    [
      currentWorkoutPlan?.id ?? "no-current-plan",
      latestAssessment?.id ?? "no-assessment",
      latestSession?.id ?? "no-recent-session",
    ],
  );
}

export async function buildWorkoutSummaryDraft(input: WorkoutSummaryInput) {
  const fallback = buildFallbackWorkoutSummaryDraft(input);
  const latestAssessment = getLatestAssessment(input.assessments);
  const adjustments = summarizeExerciseAdjustments(input.sessionWorkout?.exercises ?? []);

  try {
    return await enhanceDraftWithOpenAI(
      fallback,
      input.locale === "et"
        ? "Koosta kliendile lühike, konkreetne treeningu kokkuvõtte mustand ning lisa treenerile eraldi sisemine märkus. Hoia toon professionaalne, sõbralik ja konkreetne."
        : "Write a short, specific post-session recap draft for the client and a separate internal coaching note. Keep the tone professional, clear, and supportive.",
      {
        locale: input.locale,
        type: "workout-summary",
        client: input.client,
        session: input.session,
        plannedWorkout: input.plannedWorkout,
        sessionWorkout: input.sessionWorkout,
        latestAssessment,
        exerciseAdjustments: adjustments,
      },
    );
  } catch (error) {
    console.error("OpenAI workout summary generation failed.", error);
    return fallback;
  }
}

export async function buildNextSessionDraft(input: WorkoutSummaryInput) {
  const fallback = buildFallbackNextSessionDraft(input);
  const adjustments = summarizeExerciseAdjustments(input.sessionWorkout?.exercises ?? []);

  try {
    return await enhanceDraftWithOpenAI(
      fallback,
      input.locale === "et"
        ? "Koosta treenerile järgmise treeningu sisemine soovitus. Lähtu plaanitud ja tegeliku soorituse erinevusest, koormuse taluvusest ja kliendi eesmärkidest."
        : "Create an internal next-session recommendation for the coach. Use the gap between planned and actual execution, load tolerance, and the client's goals.",
      {
        locale: input.locale,
        type: "next-session",
        client: input.client,
        session: input.session,
        plannedWorkout: input.plannedWorkout,
        sessionWorkout: input.sessionWorkout,
        exerciseAdjustments: adjustments,
      },
    );
  } catch (error) {
    console.error("OpenAI next-session generation failed.", error);
    return fallback;
  }
}

export async function buildAdaptivePlanDraft(input: AdaptivePlanInput) {
  const fallback = buildFallbackAdaptivePlanDraft(input);
  const latestAssessment = getLatestAssessment(input.recentAssessments);
  const latestSession = [...input.recentSessions].sort((a, b) =>
    b.startAt.localeCompare(a.startAt),
  )[0];

  try {
    return await enhanceDraftWithOpenAI(
      fallback,
      input.locale === "et"
        ? input.kind === "workout"
          ? "Koosta treenerile uus treeninguploki mustand, mis arvestab kliendi eesmärke, hiljutisi sessioone ja mõõtmisi. Sisemine märkus peab ütlema, mida enne kinnitamist üle kontrollida."
          : "Koosta treenerile uus toitumiskava mustand, mis arvestab kliendi eesmärke, taastumist ja viimaseid mõõtmisi. Sisemine märkus peab ütlema, mida enne kinnitamist üle kontrollida."
        : input.kind === "workout"
          ? "Create an updated workout block draft for the coach based on the client's goals, recent sessions, and assessments. The internal note should say what to verify before approving it."
          : "Create an updated nutrition draft for the coach based on the client's goals, recovery needs, and recent assessments. The internal note should say what to verify before approving it.",
      {
        locale: input.locale,
        type: input.kind,
        client: input.client,
        currentWorkoutPlan: input.currentWorkoutPlan,
        latestAssessment,
        latestSession,
        recentSessions: input.recentSessions.slice(0, 6),
      },
    );
  } catch (error) {
    console.error("OpenAI adaptive plan generation failed.", error);
    return fallback;
  }
}

export async function buildNutritionPlanRecommendation(input: NutritionPlanInput) {
  const fallback = buildFallbackNutritionPlan(input);

  try {
    return await enhanceNutritionPlanWithOpenAI(fallback, input);
  } catch (error) {
    console.error("OpenAI nutrition plan generation failed.", error);
    return fallback;
  }
}

export async function buildFirstWorkoutRecommendation(input: FirstWorkoutInput) {
  const fallback = buildFallbackFirstWorkout(input);

  try {
    return await enhanceFirstWorkoutWithOpenAI(fallback, input);
  } catch (error) {
    console.error("OpenAI first workout generation failed.", error);
    return {
      ...fallback,
      exercises: ensureFiveExercises([], fallback.exercises),
    };
  }
}
