import {
  createSession,
  SCENARIOS,
  transitionSession,
  type LabAction,
  type LabSession,
  type ScenarioId,
} from "./interaction-lab";

export type LabContext = "home" | "school" | "community";
export type SavedLabRun = {
  id: string;
  robotId: string | null;
  robotName: string | null;
  context: LabContext;
  session: LabSession;
};

export const HISTORY_KEY = "careloop.interaction-history.v1";
export const MAX_SAVED_RUNS = 20;

const contexts = new Set<LabContext>(["home", "school", "community"]);
const scenarios = new Set<string>(SCENARIOS.map((scenario) => scenario.id));
const terminalPhases = new Set(["completed", "declined", "cancelled"]);
const actions = new Set<LabAction>(["start", "accept", "decline", "repeat", "unclear", "back", "confirm", "stop"]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validOptionalString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 200);
}

function reconstruct(value: unknown): SavedLabRun | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length < 1 || value.id.length > 100) return null;
  if (!validOptionalString(value.robotId) || !validOptionalString(value.robotName)) return null;
  if (typeof value.context !== "string" || !contexts.has(value.context as LabContext)) return null;
  if (!isRecord(value.session)) return null;

  const input = value.session;
  if (typeof input.scenarioId !== "string" || !scenarios.has(input.scenarioId)) return null;
  if (!terminalPhases.has(String(input.phase)) || !Array.isArray(input.events) || input.events.length === 0 || input.events.length > 2000) return null;
  if (!(input.startedAt === null || (typeof input.startedAt === "number" && Number.isFinite(input.startedAt)))) return null;
  if (!(input.endedAt === null || (typeof input.endedAt === "number" && Number.isFinite(input.endedAt)))) return null;
  if (!Number.isInteger(input.repeatCount) || (input.repeatCount as number) < 0) return null;

  let previousAt = -Infinity;
  let session: LabSession;
  try {
    const first = input.events[0];
    if (!isRecord(first) || typeof first.at !== "number" || !Number.isFinite(first.at)) return null;
    session = createSession(input.scenarioId as ScenarioId, first.at);
    for (const rawEvent of input.events) {
      if (!isRecord(rawEvent) || typeof rawEvent.action !== "string" || !actions.has(rawEvent.action as LabAction)) return null;
      if (typeof rawEvent.at !== "number" || !Number.isFinite(rawEvent.at) || rawEvent.at < previousAt) return null;
      previousAt = rawEvent.at;
      const next = transitionSession(session, rawEvent.action as LabAction, rawEvent.at);
      if (next === session) return null;
      const event = next.events.at(-1);
      if (!event || rawEvent.from !== event.from || rawEvent.to !== event.to || rawEvent.at !== event.at) return null;
      session = next;
    }
  } catch {
    return null;
  }

  if (!terminalPhases.has(session.phase)) return null;
  if (input.phase !== session.phase || input.startedAt !== session.startedAt || input.endedAt !== session.endedAt || input.repeatCount !== session.repeatCount) return null;
  return {
    id: value.id,
    robotId: value.robotId,
    robotName: value.robotName,
    context: value.context as LabContext,
    session,
  };
}

export function parseSavedRuns(raw: string | null): SavedLabRun[] {
  if (raw === null) return [];
  try {
    if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const idCounts = new Map<string, number>();
    for (const entry of parsed) {
      if (isRecord(entry) && typeof entry.id === "string") idCounts.set(entry.id, (idCounts.get(entry.id) ?? 0) + 1);
    }
    const runs: SavedLabRun[] = [];
    for (const entry of parsed) {
      const run = reconstruct(entry);
      if (run && idCounts.get(run.id) === 1) runs.push(run);
    }
    return runs.slice(0, MAX_SAVED_RUNS);
  } catch {
    return [];
  }
}

export function addSavedRun(runs: SavedLabRun[], run: SavedLabRun): SavedLabRun[] {
  const next = [run, ...runs.filter((saved) => saved.id !== run.id)].slice(0, MAX_SAVED_RUNS);
  const byteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (byteLength([run]) > 1024 * 1024) throw new RangeError("Saved interaction run exceeds the one-megabyte limit");
  while (next.length > 1 && byteLength(next) > 1024 * 1024) next.pop();
  return next;
}
