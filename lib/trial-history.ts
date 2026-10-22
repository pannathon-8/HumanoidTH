import {
  buildPlan,
  createTrial,
  transitionTrial,
  type PlanInput,
  type TrialEvent,
  type TrialMode,
  type TrialState,
} from "./interaction-plan";

export const TRIAL_HISTORY_KEY = "careloop.adaptive-trials.v1";
export const MAX_STUDIES = 10;
const MAX_BYTES = 1024 * 1024;
const MAX_EVENTS = 2_000;
const categories = new Set(["learning", "communication", "assistance", "routine", "custom"]);
const constraints = new Set(["no-speech", "no-hearing", "short-text", "large-controls", "other"]);
const adaptations = new Set(["text-buttons", "short-prompts", "step-by-step"]);
const modes = new Set<TrialMode>(["voice", "text"]);
const terminalPhases = new Set(["completed", "cancelled"]);
const eventTypes = new Set(["start", "answer", "repeat", "switch-channel", "back", "stop"]);

export type SavedStudy = {
  id: string;
  createdAt: number;
  input: PlanInput;
  trials: TrialState[];
  feedback: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validInput(value: unknown): PlanInput | null {
  if (!isRecord(value)) return null;
  const candidate = value;
  if (!categories.has(String(candidate.category)) || typeof candidate.goalText !== "string" || typeof candidate.contextText !== "string" ||
      !Array.isArray(candidate.constraints) || candidate.constraints.some((item) => typeof item !== "string" || !constraints.has(item)) ||
      typeof candidate.otherConstraint !== "string" || typeof candidate.otherAdaptation !== "string" || !adaptations.has(candidate.otherAdaptation) ||
      !Array.isArray(candidate.customSteps) || candidate.customSteps.some((item) => typeof item !== "string")) return null;

  // Explicitly whitelist persisted input so unrelated/private properties never survive.
  return {
    category: candidate.category as PlanInput["category"],
    goalText: candidate.goalText,
    contextText: candidate.contextText,
    constraints: [...candidate.constraints] as PlanInput["constraints"],
    otherConstraint: candidate.otherConstraint,
    otherAdaptation: candidate.otherAdaptation as PlanInput["otherAdaptation"],
    customSteps: [...candidate.customSteps],
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function replayTrial(value: unknown, rebuiltPlan: TrialState["plan"]): TrialState | null {
  if (!isRecord(value) || !modes.has(value.initialMode as TrialMode) || !terminalPhases.has(String(value.phase)) ||
      !Array.isArray(value.events) || value.events.length < 1 || value.events.length > MAX_EVENTS) return null;
  let state: TrialState;
  try {
    state = createTrial(rebuiltPlan, value.initialMode as TrialMode);
    let previousAt = -1;
    for (const rawEvent of value.events) {
      if (!isRecord(rawEvent) || typeof rawEvent.type !== "string" || !eventTypes.has(rawEvent.type) ||
          typeof rawEvent.at !== "number" || !Number.isFinite(rawEvent.at) || rawEvent.at < 0 || rawEvent.at < previousAt ||
          !Number.isInteger(rawEvent.stepIndex) || !modes.has(rawEvent.mode as TrialMode) || typeof rawEvent.outcome !== "string") return null;

      previousAt = rawEvent.at;
      let action: Parameters<typeof transitionTrial>[1];
      switch (rawEvent.type) {
        case "start": case "repeat": case "back": case "stop":
          action = { type: rawEvent.type, at: rawEvent.at };
          break;
        case "answer":
          if (typeof rawEvent.choiceId !== "string") return null;
          action = { type: "answer", choiceId: rawEvent.choiceId, at: rawEvent.at };
          break;
        case "switch-channel": {
          const nextMode = rawEvent.nextMode ?? rawEvent.mode;
          if (!modes.has(nextMode as TrialMode)) return null;
          action = { type: "switch-channel", mode: nextMode as TrialMode, at: rawEvent.at };
          break;
        }
        default:
          return null;
      }
      const next = transitionTrial(state, action);
      if (next === state) return null;
      const generated = next.events.at(-1);
      if (!generated || rawEvent.at !== generated.at || rawEvent.stepIndex !== generated.stepIndex || rawEvent.mode !== generated.mode ||
          rawEvent.outcome !== generated.outcome || rawEvent.type !== generated.type ||
          rawEvent.choiceId !== generated.choiceId || (rawEvent.nextMode ?? undefined) !== generated.nextMode) return null;
      state = next;
    }
  } catch {
    return null;
  }

  if (!terminalPhases.has(state.phase) || value.phase !== state.phase || value.mode !== state.mode || value.stepIndex !== state.stepIndex ||
      value.startedAt !== state.startedAt || value.endedAt !== state.endedAt || value.repeatCount !== state.repeatCount ||
      value.switchCount !== state.switchCount || value.blockedCount !== state.blockedCount || value.lastMessage !== state.lastMessage ||
      !sameJson(value.answers, state.answers) || !sameJson(value.plan, state.plan) || value.initialMode !== state.initialMode) return null;
  return state;
}

function reconstruct(value: unknown): SavedStudy | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length < 1 || value.id.length > 100 ||
      typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || value.createdAt < 0 ||
      typeof value.feedback !== "string" || value.feedback.length > 500 || !Array.isArray(value.trials) || value.trials.length < 1 || value.trials.length > 2) return null;
  const input = validInput(value.input);
  if (!input) return null;
  const result = buildPlan(input);
  if (!result.plan) return null;
  const plan = result.plan;
  const trials: TrialState[] = [];
  for (const rawTrial of value.trials) {
    const trial = replayTrial(rawTrial, plan);
    if (!trial) return null;
    trials.push(trial);
  }
  if (new Set(trials.map(({ initialMode }) => initialMode)).size !== trials.length || trials.some((trial) => !sameJson(trial.plan, plan))) return null;
  return { id: value.id, createdAt: value.createdAt, input, trials, feedback: value.feedback };
}

export function parseStudies(raw: string | null): SavedStudy[] {
  if (raw === null) return [];
  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const idCounts = new Map<string, number>();
    for (const entry of parsed) if (isRecord(entry) && typeof entry.id === "string") idCounts.set(entry.id, (idCounts.get(entry.id) ?? 0) + 1);
    const studies: SavedStudy[] = [];
    for (const entry of parsed) {
      const study = reconstruct(entry);
      if (study && idCounts.get(study.id) === 1) studies.push(study);
    }
    return studies.slice(0, MAX_STUDIES);
  } catch {
    return [];
  }
}

export function appendStudy(studies: SavedStudy[], study: SavedStudy): SavedStudy[] {
  if (new TextEncoder().encode(JSON.stringify(study)).byteLength > MAX_BYTES) {
    throw new RangeError("Saved adaptive trial study exceeds the one-megabyte limit");
  }
  const cleanStudy = reconstruct(study);
  if (!cleanStudy) throw new TypeError("Invalid adaptive trial study");
  const validStudies = studies.map(reconstruct).filter((item): item is SavedStudy => item !== null);
  const next = [cleanStudy, ...validStudies.filter(({ id }) => id !== cleanStudy.id)].slice(0, MAX_STUDIES);
  const byteLength = (items: SavedStudy[]) => new TextEncoder().encode(JSON.stringify(items)).byteLength;
  if (byteLength([cleanStudy]) > MAX_BYTES) throw new RangeError("Saved adaptive trial study exceeds the one-megabyte limit");
  while (next.length > 1 && byteLength(next) > MAX_BYTES) next.pop();
  return next;
}
